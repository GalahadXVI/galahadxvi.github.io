---
title: A Persistent DDoS Vector in Laravel’s File Session Driver
og-image: og-image-file-session.jpg
---

# A Persistent DDoS Vector in Laravel’s File Session Driver

In an earlier post, I  a large DDoS attack against one of my applications and a performance issue that took far longer to understand than it should have. At the time, I wrote it off as a bad configuration choice and moved on. More recently, out of curiosity, I came back to it. I knew the file session driver was the cause, but I wanted to understand exactly what was happening under the hood.

What I found is that someone can cause real disruption on a site that uses the file session driver by relying on how session garbage collection works.

The core issue is that the file session garbage collector runs synchronously during the request lifecycle and performs an O(n) scan over every session file on disk. The cost of cleanup grows directly with the number of session files present. An attacker doesn’t need to do anything clever. By sending a large number of requests without session cookies, they can force Laravel to create hundreds of thousands, or even millions, of session files.

As `storage/framework/sessions` fills up, all of those files sit in a single flat directory. When the garbage collection runs, it scans every file in that directory. Even after the attack traffic stops, normal requests still trigger garbage collection. Each unlucky request that hits that path pays the full cost of scanning the entire directory.

While this is all working as designed, what makes this problem unique is that the slowdown is that persists long after the attack finishes.

## Why The Degradation Persists

This happens due to how Laravel creates and cleans up sessions during a request. If a request arrives without a valid session cookie, the `StartSession` middleware creates a new session ID. At the end of the request, that session is written to disk through `saveSession`. There is no throttling here. Every stateless request creates a new file in `storage/framework/sessions`.

On every request, Laravel runs a simple random check known as the session lottery. By default, around 2% of requests trigger the garbage collector. When a request is selected, the file session handler runs its garbage collection method synchronously. That 2% sounds small, but it adds up fast. This applies to every request that passes through the session middleware. Even a site with low traffic can hit this regularly, often every minute or so. And once the session directory has grown large, each of those runs is expensive.

That method uses the Symfony Finder to scan the entire session directory, check file modification times, and then delete expired sessions. The key detail is that the full directory scan happens before any deletion. The cost grows linearly with the total number of session files. Even if only a handful of files are expired, the scan still checks every file. Since this runs inline during the request, users feel the latency right away. And once the directory gets large enough, everyday traffic is enough to keep the app stuck in this degraded state.

A short burst of requests can push the app into a bad state that sticks around long after the traffic stops. Once the session directory reaches that point, normal requests are enough to keep triggering costly cleanup work.

In simple terms, someone can hit the site for a few minutes and cause chaos for hours. Each time the session garbage collection runs, Laravel has to scan the entire session directory. That scan runs inside the request cycle, so requests get blocked. CPU usage spikes, responses slow down or time out, and the app stays unhealthy until the sessions expire naturally or someone cleans them up by hand.

## Reproducing The Issue

I was able to reproduce this locally on a fresh Laravel installation using the file session driver. With around 200,000 session files on disk, request latency jumped from roughly 40ms to just over **2 seconds** whenever the session garbage collector ran. The slowdown scaled more or less linearly with the number of files present.

To reach that point, I started with a new Laravel project and confirmed the sessions directory was empty. I set the session driver to `file` and loaded the site repeatedly while clearing cookies each time. This confirmed that a new session file was created on every request. After that, I simulated stateless traffic using ApacheBench to generate a large number of sessions quickly. To speed things up further, I also created session files directly on disk, which was much faster than simulating each request. I then verified the final count, which came out to 222,703 session files.

Next, I forced the session lottery to run on every request by setting it to `[1,1]`. This setup is not realistic for production, but with enough traffic, the default lottery value of `[2,100]` would still trigger cleanup on a regular basis. With that configuration in place, loading the page locally produced a response time of **2.13 seconds**. Under normal conditions, the same request completed in about 41ms. That’s roughly a 5,100% increase in latency.

What stands out is that even modest repeated traffic can push the system into this degraded state. The key issue is that the impact remains after the traffic stops. Scanning just 200,000 files during the garbage collection process on a local environment is enough to cause very noticeable slowdowns. 200,000 files is also not an extreme number. It's been reported that the average DDoS attack sends [240,000 requests _per second_](https://www.imperva.com/blog/81-increase-in-large-volume-ddos-attacks/). If they are stateless (and they usually are), that is 240,000 new session files created every second.  

In practice, a site using the file session driver could take a serious performance hit for hours after a short burst of traffic. A simple command like `ab -n 1000000 -c 10 https://www.yourwebsite.com` could be enough to leave the application struggling long after those requests have finished.

## Why This Matters

Flooding a service with requests is nothing new. Scanning files for cleanup is also nothing new. When you look at how these pieces fit together, the behavior itself is easy to explain. What stands out is how easily the system can slip into a degraded state, and how unclear the recovery path is once that happens.

A simple command, or a fairly unsophisticated actor, can cause a lot of disruption. That disruption can last for hours after the traffic stops. At that point, ongoing load is no longer the issue. Garbage collection keeps doing expensive work because of what’s already on disk.

It’s important to stress that this is not a logic bug. The system is doing exactly what it was designed to do. File-based session storage has well-known limits, and Laravel already offers other session drivers for higher-scale or more hostile environments.

The problem is that this limitation can be exploited on purpose. An attacker doesn’t need to break anything or bypass safeguards. They can rely on normal behavior to push the app into a bad state and leave it there. The result is real disruption caused with very little effort.

## A Real-World Incident
This isn’t just a theoretical issue. We ran straight into it during a real DDoS incident [back in 2020](/blog/mitigating-a-massive-ddos-attack-the-24-hour-aftermath-that-haunted-me). The attack itself was mitigated fairly quickly, but the application stayed in a badly degraded state long after traffic dropped off. CPU usage stayed high, response times kept climbing, and requests would randomly time out.

At first, we focused on the usual things. We deployed Cloudflare, checked the database, adjusted PHP settings, and even scaled the infrastructure. None of that helped. The problem was not ongoing load in the normal sense, so those changes only treated symptoms.

After many hours of digging, it became clear that session cleanup was taking up most of the request time. During the attack, every request without a session cookie created a new session file. The garbage collection had to trawl through a huge backlog of files over and over again.

The DDoS was still hurting us even after it ended, purely because we were using the file session driver. The immediate fix was to lower the session lifetime so garbage collection could eventually clear the backlog. Longer term, we moved sessions to Redis, which removed the problem entirely.

Admittedly, we had session lifetime set quite high, which significantly exacerbated the problem. Because of that, I never really viewed it as a Laravel issue, but rather as an incredibly unfortunate configuration choice on our part.

## Mitigation
Before publishing this post, I reached out to Taylor and shared a detailed write-up of what I found. We both agreed there isn’t a clear fix beyond better guidance. The file session driver is behaving as designed. The real takeaway is that it’s not a good fit for apps that expect high traffic or hostile conditions.

There are ideas that could reduce the impact. One example is moving session garbage collection out of the request cycle and running it on a fixed schedule. I haven’t explored those options myself. As things stand today, the safest approach is to simply avoid the file session driver for anything that needs to hold up under load.

For production, especially on public-facing apps, I’d treat the file session driver as local-only. It’s fine for development. Once real traffic is involved, moving sessions to something like Redis removes this entire class of problem.

## Final Thoughts
This issue sits in a strange middle ground between configuration and security. It depends on a specific set of conditions and most apps will never hit it. But when those conditions do line up, the impact can cause a real headache.

Most applications will never run into this. Still, it highlights a real risk when the file session driver is used in production. Availability is a security concern too. Persistent failure modes are worth understanding, even when they come from reasonable design choices. Long session lifetimes combined with adversarial traffic can lead to some unexpected outcomes. Filesystem-backed sessions tend to work best in low-traffic, trusted environments.

As mentioned earlier, I shared this with Taylor, and he said he would think about how best to warn users about the trade-offs involved. Beyond that, while theoretical fixes exist, they may be hard to justify given how narrow the conditions are.

The goal here was simple. This happened to me in the real world. I dug into it, understood what was going on, and thought it was worth sharing.
