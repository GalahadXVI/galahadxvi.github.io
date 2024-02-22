---

title: Mitigating a Massive DDoS Attack - The 24 Hour Aftermath That Haunted Me
---

# Mitigating a Massive DDoS Attack: The 24 Hour Aftermath That Haunted Me

During the peak of the COVID period, SimpleMMO, experienced unprecedented success. Within just 7 days, our daily downloads skyrocketed from around 70 to a peak of around 5,000. This sudden surge in users propelled me into uncharted territory. No longer catering to a small niche, SimpleMMO was now attracting tens of thousands of daily users. As the demand surged, I found myself working tirelessly to upgrade our infrastructure to meet the needs of our growing player base. Our servers struggled to handle the influx of activity, prompting me to overhaul numerous game mechanics to optimize efficiency.

Over the following month, I managed to reduce the game's overall load by approximately 70%, a significant achievement given the rapid scale-up required. For the next few weeks, operations ran smoothly.

## Houston, we have a problem.

The challenge with increased game exposure is the rise in malicious actors attempting to exploit systems. I've always prioritized building robust and secure systems to the best of my ability, stemming from a haunting memory of one of my websites being hacked in 2008 when I was just 13 years old. This incident instilled a deep sense of paranoia, driving me to emphasize security in product development. 

Though I possess experience in mitigating common OWASP vulnerabilities such as SQL Injection, XSS Attacks, and session hijacking, encountering Distributed Denial of Service attacks (DDoS for short) is something I didn’t really experience. This knowledge gap is understandable, as my previous products had limited exposure, which diminished the incentive for malicious actors to target my systems.

However, in June 2021, everything changed. I was awoken around 6 am by a message: 'The game is down.' While I had grown accustomed to encountering such issues during my system scaling efforts, this instance felt particularly unsettling. Despite employing my usual measures, I found them ineffective in resolving the problem. It wasn't long before the unsettling thought of a DDoS attack crossed my mind.

I logged into CloudFlare to check the statistics. As I feared, some endpoints were inundated with a staggering 1.2 million requests per minute. The sheer scale was unfathomable, and it became apparent that the system was ill-prepared to handle such an onslaught.

Interestingly, the DDoS attack targeted only the `/login` POST endpoint. Upon closer inspection of the requests, it became evident that this wasn't an email enumeration attack; rather, the attacker repeatedly sent the same dummy email address, indicating a clear intent to disrupt my game. With this understanding, I devised a straightforward strategy: leveraging Cloudflare's DDoS protection.

Cloudflare's DDoS protection proved highly effective. The attack followed a distinct pattern, allowing me to implement countermeasures by filtering out these specific requests and redirecting them to Cloudflare for handling. By configuring Cloudflare's Web Application Firewall to manage all incoming requests to the `/login` endpoint, I successfully mitigated the attack.

Upon activating the firewall, there was an immediate and dramatic decrease in requests to the game. It was a seamless solution that effectively stopped the attack. However, despite this improvement, complaints persisted about the slowness of the server. Initially, I attributed this to the server needing time to recover after enduring such a heavy load.

As I accessed the server to diagnose the sluggishness, I immediately noticed that the CPU load had been consistently hovering just below 100% since the DDoS attack. This perplexed me greatly because I had successfully mitigated the attack, yet the aftermath seemed more debilitating than the attack itself. I was utterly baffled as to the cause of this unexpected issue.

![CPU Usage](/img/blog/22-feb-ddos/1.png "CPU Usage")


Over the next few hours, the game's performance continued to deteriorate gradually. Each passing minute seemed to exacerbate the issue, leaving me feeling helpless as I witnessed the game's functionality degrade. To rectify the situation, I employed various tactics, including database indexing techniques to optimize query efficiency and increasing server capacity by upgrading CPU and RAM. However, none of these measures yielded any improvement. It was a frustrating and bewildering experience, as every attempted solution seemed futile. In fact, the performance degraded further during the time it took me to implement these changes.

![htop](/img/blog/22-feb-ddos/2.png "htop")

Utilizing `htop`, I gained insight into the severity of the situation. The MySQL and Apache processes were in a frenzy, with nearly every resource pushed to its limit.

## Calling in the cavalry

Slowly realizing that I'm out of my depth, I made the decision to seek expertise outside my own. As, at the time, I didn't know anyone who was proficient in DevOps, I opted to post an urgent request for assistance on Upwork.

![Upwork Listing](/img/blog/22-feb-ddos/3.png "Upwork Listing")

Within minutes of posting the urgent request, I received responses from several system administrators. I reached out to several candidates, but unfortunately, none of them appeared to possess the expertise required to address the issue. Then, I came across John (not his actual name), a skilled DevOps engineer specializing in server management. "Perfect," I thought. I briefed him on the situation, and over the next 3 or 4 hours, we collaborated closely to identify the root cause of the problem.

## Figuring out the cause

Our initial course of action was to assess the health of the MySQL database, as it appeared to be the primary culprit behind the issue. Despite its high CPU usage, our examination revealed no indications of the MySQL database being at fault. Surprisingly, the write speed of the MySQL processes peaked at a mere `70k/s`, which was unexpectedly low, ruling out the possibility of heavy write processes burdening the database.

![Mysql](/img/blog/22-feb-ddos/4.png "Mysql")

His next step was to investigate the possibility of missing indexes. Despite my growing concern that MySQL might not be the root cause of the issue and that we could be focusing on the wrong area, I decided to follow John's lead.

To our surprise, John discovered a table that lacked any indexes.

![Upwork Conversation](/img/blog/22-feb-ddos/5.png "Upwork Conversation")

I implemented the indexes, waited for about 10 minutes, and checked for any improvement. Fortunately, there was. The MySQL process had significantly decreased in CPU usage. However, oddly, this led to an increase in the load on the Apache process.

As we delved deeper into the issue, it grew increasingly perplexing. Each change we made either had no discernible impact or exacerbated the problem.

After roughly 6 hours of troubleshooting, we remained baffled by the root cause. We even deployed an Application Performance Monitor (APM) to aid in diagnostics, but all results returned clean. The elusive issue continued to evade us.

In a final attempt to resolve the issue, we decided to migrate our server from Apache's `mod_php` to `PHP-FPM` and initiated a server restart. Almost immediately, we observed significant improvements. Everything was operating swiftly once more! `mod_php` must’ve been the issue.

![Bad Gateway](/img/blog/22-feb-ddos/6.png "Bad gateway")

However, our relief was short-lived. Roughly 15 minutes later, we began experiencing server hiccups once more, with some users encountering a `502 Bad Gateway` response. The problems were resurfacing. I promptly accessed the CPU monitor and observed the gradual climb in CPU usage, showing no signs of stopping.

![CPU Usage](/img/blog/22-feb-ddos/7.png "CPU Usage")

We were utterly perplexed. Despite our exhaustive efforts, we remained clueless as to what was transpiring. All we knew was that the DDoS attack had triggered something, but the nature of that trigger eluded us entirely.

As the night wore on, it became increasingly late for John (approximately 2 am in his local time). He had to log off, leaving me to continue the investigation solo. I dedicated the entire evening to scrutinizing every aspect with meticulous attention to detail. Yet, despite my thorough examination, nothing was wrong. Everything seemed to be well-configured and, in some instances, even performing optimally.

As the clock struck 2 am, exhaustion weighed heavily upon me. I had been glued to the computer screen for nearly 18 consecutive hours, my will to live slowly dropping with each passing minute. Despite my efforts, I had exhausted every conceivable avenue:

-	Mitigated a 1.2 million reqs/minute DDoS attack by leveraging Cloudflare's protection.
-	Improved severe bottlenecks in the code by implementing caching mechanisms.
-	Implemented various indexes across the database to significantly enhance data filtering speed.
-	Engaged a professional system administrator to assist in diagnosing the cause, but even he was just as baffled as I was.
-	Upgraded the system's hardware by increasing the RAM and vCPU count.
-	Migrated the server from Apache's `mod_php` to `PHP-FPM` for improved performance.
-	Installed an Application Performance Monitor in an attempt to pinpoint the root cause of the issue.

At this point, I was starting to question if I had accidentally stumbled into a parallel universe. Nothing was making sense anymore, and each attempt to fix the issue seemed to make it worse. It was like being trapped in a world where every move I made only added to the confusion.

## The cause and solution 

At approximately 3am, just as I was preparing to call it a day, I felt compelled to make one final attempt at figuring out the problem's root cause. I resolved to delve deeply into the heart of the matter: the underlying process itself. This led me to use `strace` a powerful diagnostic tool for Linux to help monitor interactions between processes and the Linux kernel.

`sudo strace -p 887669`
 
While trawling the output, I stumbled upon a strange observation. The response repeatedly accessed numerous session files located within `/storage/framework/sessions`. What struck me as particularly unusual was not merely the access to a few files, but rather the staggering volume — hundreds of thousands of them.

The realization immediately struck me. The culprit lay in the Laravel sessions, which were being processed by the session system. During the onslaught of the DDoS attack on the login endpoint, a new session was generated with each unique request. Since we were using the file driver for storing user sessions at that time, a corresponding file was created on the server to manage these sessions. Consequently, the `/storage/framework/sessions ` directory was inundated with millions of these minuscule files. Due to the small size of the files, they did not significantly impact the servers storage space, thus escaping detection.

In Laravel, when employing the `File` session driver, as there is no built-in mechanism to purge expired sessions, it resorts to a "Session Sweeping Lottery." This entails that, for every X requests to the server, the system traverses all sessions within the `/storage/framework/sessions` directory and deletes those that have expired. However, the issue arises when dealing with a high number of session files, such as a literal million (in our case).

Essentially, every 1 out of 100 requests had to sift through millions of session files to verify their expiry status. With our sessions configured to expire after 24 hours, this resulted in a significant accumulation of sessions generated during the DDoS attack.

I found myself genuinely amazed for a couple of reasons: firstly, the satisfaction of pinpointing the root cause of an issue that had nearly overwhelmed me; and secondly, the sheer effectiveness of the DDoS attack, which rendered the server utterly incapacitated for nearly 24 hours even after we had mitigated it.

The solution to this problem was surprisingly straightforward: I temporarily reduced the session expiry time to 1 hour. While a more comprehensive fix involved migrating the session driver to Redis (which I implemented later that month), the reduction of session expiry proved remarkably effective. During the subsequent sweep, the server swiftly cleared out the session files from the DDoS attack. Once done, the server resumed its operations flawlessly. I was nearly moved to tears of relief and joy at this point.

Whether the perpetrator had exploited this vulnerability knowingly remains uncertain. While I lean towards believing they hadn't, given the highly specific conditions required for such exploitation, one thing remains undeniable: they certainly achieved their goal of causing maximum chaos.

## Conclusion

Despite the immense toll that day took on me, I don't regret experiencing it. In fact, the lessons from it were invaluable. Not only did I acquire proficiency in leveraging CloudFlare to mitigate DDoS attacks, but I also honed my skills in optimizing database indexes, mastering the utilization of Application Performance Monitors, and deepening my understanding of Laravel's intricacies.

<script defer src="https://cdn.commento.io/js/commento.js"></script>
<div id="commento"></div>