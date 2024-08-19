# From Zero to 35M: The struggles of scaling Laravel with Octane

This blog post aims to share my experience using Laravel Octane with OpenSwoole to scale our system, enabling it to handle more than 35 million requests per day. I'll also discuss the challenges I encountered as a direct result of this increased traffic.

Before I get into the technical details of my journey, I want to share a bit about our application and what it does. This will give you some context and make it easier to follow along with the challenges I encountered and the solutions I came up with.

## The Application

IdleMMO is an online multiplayer game built with Laravel and Alpine.js. Since its public launch in December 2023, it has seen incredible growth, with over 160,000 users signing up – most of them in just the past two months. This rapid growth has come with some major scaling challenges that I’ve had to face head-on.

IdleMMO is in a unique situation because it's much more process-heavy compared to other, more typical web apps I've worked on. There’s a ton of calculations happening in the background — after all, it’s an MMORPG. With that in mind, our server naturally needs to be more powerful than what a typical web app would require.

Although I’ve discussed scaling issues in the past with our other project, SimpleMMO, the growth of IdleMMO has been on a whole different level. The scale and intensity of its expansion have exceeded anything I’ve dealt with before. Since I’m responsible for the servers and infrastructure for IdleMMO, it was up to me to tackle this unique situation. The rapid growth pushed me to explore new solutions and optimize our infrastructure in ways I hadn’t anticipated.

## Initial Set Up

When we first launched the project, our infrastructure was relatively straightforward. We used NGINX as our web server, MySQL for our database, Redis for caching, and Laravel Horizon for managing our queues. This setup served us well for the first 3 to 4 months after the game went live. 

During this period, we were only gaining a few hundred new users per day, which our system could handle comfortably without overextending our resources. We considered this growth rate reasonable and manageable. 

Everything changed when we released the game on the Google Play Store. Suddenly, we went from gaining a few hundred new users per day to several thousand. This dramatic surge in traffic quickly revealed the limitations of our initial setup. It became clear that our existing infrastructure couldn’t handle the unexpected load, forcing me to reassess and upgrade our system to meet these new demands.

## The Problem

The main challenge we encountered was that our existing setup simply couldn’t handle the sheer volume of incoming requests. PHP-FPM, which we initially relied on, was struggling to manage the increased load without requiring a significant investment in server capacity.

Even with extra investments in our servers, it quickly became clear that our current setup couldn’t handle the surge in traffic. I could just keep upgrading the server specs, but that would just be like kicking a can down the road. So, I started looking into more complex solutions, like distributing our servers and implementing load balancing techniques. However, I was concerned that these approaches would introduce unnecessary complexity and potentially create more problems than they solved.

## The Solution

That's when I discovered Laravel Octane, which is marketed as a way to supercharge a Laravel application. It promised to handle more requests with fewer resources, which was exactly what I was looking for. Intrigued by its potential, I decided to give it a shot.

The impact was immediate and remarkable. You know the saying, "if it's too good to be true, it probably is"? Well, in this case, it actually delivered. Our performance saw a significant boost, and we were suddenly able to handle a staggering influx of new users.

This improvement was clearly reflected in our application performance metrics. I saw a dramatic enhancement in response times. The 95th percentile of users experienced a drop from an average of **394ms** to just **172ms**. This massive improvement left me genuinely amazed.

![IMMO Sentry Stats](/img/immo-sentry.png)

## Why Laravel Octane Worked So Well

The remarkable success of Laravel Octane in our project can be largely credited to its foundation on Swoole, a high-performance, coroutine-based PHP framework. This powerful combination enabled us to handle a much higher volume of requests while using fewer resources, making it a game-changer for our scaling efforts.

Ocanes's key advantage lies in its approach to application bootstrapping. Unlike PHP-FPM, which initializes the Laravel application for each incoming request, Octane bootstraps the application once and keeps it in memory. This fundamental difference eliminates the need for repeated bootstrapping, drastically reducing overhead and enabling Octane to handle significantly more requests compared to traditional PHP-FPM setups.

While this approach offers impressive performance gains, it also brings its own challenges. Because the application no longer needs to be bootstrapped for every request, we had to be extra careful with data that may persist across requests such as static variables and singletons.

Misusing static variables and singletons can cause unintended data sharing, which is exactly what we wanted to prevent. For example, if Request A modifies a static variable, Request B might encounter that same variable if handled by the same worker. This situation compromises the request isolation I was striving to preserve.

I aimed to ensure that each request is processed in complete isolation, maintaining the integrity and security of our application. To achieve this, I had to carefully review our codebase and take a thoughtful approach to managing state within our application. 

I actually encountered this issue firsthand, which I'll delve into later to provide a real-world example of how it can manifest.

Naively, I thought transitioning to Laravel Octane would be a breeze. After all, the Laravel documentation primarily highlighted this one issue, and I was confident that we weren't using static variables, singletons, or any other form of global state in our application. I asked myself, "What could possibly go wrong?"

As it turns out, quite a lot could and did go wrong. Fortunately, none of the issues we faced were catastrophic, but they did present me with a series of small yet persistent headaches. These unforeseen challenges taught me that even when you think you've covered all your bases, the complexities of scaling and optimizing a large application can surprise you in unexpected ways.

## The Problems With Octane

One of the challenges I ran into with Octane was the limited resources available, especially when compared to more established technologies like PHP-FPM or Apache mod_php. There weren’t many online resources on how to properly implement and scale Octane and Swoole, which often left me feeling a bit lost. During this time, I relied heavily on OpenSwoole's documentation — it became my best friend over the next few months.

Typically, in the past, when I come across an issue, the likelihood of someone else experiencing the same issue and posting about it online is quite high. However, with Octane, this wasn't the case. I found myself having to dig deep into the codebase and the documentation to figure out what was going wrong.

### Database Transaction Issues

When we first set things up, we decided to disable persistent database connections in our Laravel configuration. Honestly, I’m not entirely sure why we made that choice — it was a while ago, and the details are a bit fuzzy now. But that’s the setup we were working with.

However, I quickly ran into an unexpected quirk with Laravel Octane. Even though we had explicitly disabled persistent connections, Octane ignored this setting and kept the database connections alive across requests, going against what we had specified in our configuration file.

While Octane’s approach of keeping database connections in memory makes sense for boosting application performance, this was still unexpected for us as it wasn't documented anywhere.

After enabling Laravel Octane, I started running into several issues with database transaction save points, particularly `1305 SAVEPOINT does not exist` errors. As our application uses database transactions almost everywhere, I was inundated with these errors. I’m not a MySQL expert, but my best hypothesis is that these errors happened because the database connections were being persisted across requests. This persistence likely caused a savepoint created in one request to interfere with another, resulting in these errors.

This issue caused me a lot of frustration for several days, mainly because I had no idea that database connections were being persisted across requests. We had specifically disabled this feature in our configuration file, so it was completely unexpected.

The breakthrough came out of the blue when one of Laravel’s developers casually mentioned in a video that connections persist by default. This led me to dig into the Octane configuration file, where I found a commented-out class, `DisconnectFromDatabases::class`, in the `OperationTerminated` event. Simply uncommenting that line fixed our transaction issues.

The lack of clear documentation on this behavior ended up costing me valuable time trying to diagnose and fix the problem. If this information had been clearly outlined in the Octane documentation, I could have saved ourselves days of troubleshooting.

### Not enough worker connections

Laravel Octane gave our application a big boost in handling more requests. But with this increased efficiency, I ran into an unexpected problem: I quickly hit our servers maximum `worker_connections` limit.

It’s important to point out that this wasn’t a flaw in Octane itself. I likely would have faced the same issue with PHP-FPM at some point. Octane’s enhanced performance just pushed us to that limit faster than we expected.

Thankfully, the fix was simple — I increased the `worker_connections` value in our `nginx.conf` file. 

### Reaching the limit of open file descriptors

After fixing the `worker_connections` issue, I ran into another challenge: I quickly hit the limit on open file descriptors. This happened because Laravel Octane enabled us to handle so many concurrent requests that, as I increased the worker connections, Nginx was trying to open more files simultaneously.

Just like with the `worker_connections` problem, this wasn’t specifically an Octane issue; I probably would have encountered it with PHP-FPM as well.

The file descriptor limit is actually a security measure built into the operating system to prevent any single process, like Nginx, from opening too many files and potentially draining system resources.

In my situation, the default system limit for file descriptors was set at `1024`, which isn’t enough for handling high traffic—the kind of traffic Laravel Octane is built to manage.

As a quick fix, I temporarily raised the limit to `65535` using the command: `ulimit -n 65536`. However, I knew this wasn’t a permanent solution since the setting would reset after a system reboot. To address this issue properly, I’d need to implement a more permanent fix.

The long term solution was to increase the limit permanently. This was done by doing the following:

- Increasing the maximum number of open files that is allowed for all users by adding these lines to `/etc/security/limits.conf`:
```
* soft nofile 65536 
* hard nofile 65536
```

- Making sure that the limits set are being applied during the user login sessions by adding the following line to `/etc/pam.d/common-session`:
```
session required pam_limits.so
```

- Making sure the limits also apply to non-interactive sessions, like background processes, by adding the following line to `/etc/pam.d/common-session-noninteractive`:
```
session required pam_limits.so
```

- Setting the system-wide limit for the maximum number of open files by adding the following line to `/etc/sysctl.conf`:
```
fs.file-max = 2097152
```

- Allowing NGINX to handle more open files per worker process by adding the following line to `/etc/nginx/nginx.conf`:
```
worker_rlimit_nofile 65536;
```

After doing this, I restarted the server and the limit was permanently increased. No more file descriptor errors.

### Swoole Workers

As far as I understand, OpenSwoole seems to work on a straightforward principle: it creates multiple workers to handle incoming user connections. When a user connects, their request is assigned to an available worker. Once that worker finishes processing the request, it's ready for the next one.

But here’s something important to keep in mind: the number of workers should be closely tied to the server’s vCPU count. The officially recommended practice is to use between 1 and 4 workers per vCPU. If you have more workers than the CPU can handle, they might end up competing for resources, which could actually slow things down.

In Laravel Octane, the Swoole settings can be changed by tweaking the `octane.php` file. This allows us to manually set the number of workers, among other things.

```
'swoole' => [
    'options' => [
        'worker_num' => 8, 
        // Swoole options go here
    ],
],
```

Following OpenSwoole’s recommendation of 1 to 4 workers per vCPU, I configured our 8 vCPU server to run **32** workers. This setup allowed us to maximize our server’s capacity while staying within the recommended guidelines.

These optimizations were aimed at improving our server’s ability to handle sudden traffic surges, ensuring a smoother experience for our players during peak times.

```
    'swoole' => [
        'options' => [
            'worker_num' => env('SWOOLE_WORKER_NUM', swoole_cpu_num()), // Our .ENV file has SWOOLE_WORKER_NUM=32
        ],
    ],
    ],
```

At first, I felt confident that everything was under control. I made the change, ran `octane:reload`, and was on my merry way. The inclusion of the environment file made it easy to tweak the number of workers on the server, which seemed perfect for scaling our resources up or down as needed.

But then I ran into a challenge: figuring out the right moment to make those adjustments. It's not exactly easy to spot when the number of connections is getting close to maxing out the worker limit.

What makes it even trickier is how the system behaves. When all the workers are busy and a new request comes in, it gets queued. The process works, but there's no straight forward way for me to track or get info on these queued requests.

The lack of visibility into the queuing process makes it tough to proactively manage our server resources and maintain optimal performance.

We rely on Sentry.io for application monitoring, and it gives us valuable insights into incoming requests, including response times. This helps us spot potential issues with our application.

However, I quickly ran into a limitation with how Sentry operates. While this is just a hypothesis since I don’t fully understand the ins-and-outs of Sentry, it seems like it would only start to track a request after Swoole picks up the connection and begins processing it. So, if a request gets queued before being processed, Sentry doesn't capture that waiting time. This is probably because the Sentry SDK is integrated directly into Laravel, rather than being installed on the server itself like some other APM tools. But again, I’m not well versed in how Sentry works, so I could be wrong. 

The problem was that a user might send a request and end up waiting a long time for a response due to queuing. Meanwhile, Sentry showed that everything is running smoothly. We were constantly being bombarded with complaints regarding the performance of the game, yet when we looked on our end, everything seemed to be running just fine. It was a bit of a head-scratcher.

This gap between the user’s experience and what our monitoring data showed created a blind spot, making it much harder to pinpoint the root cause of the performance issues.

I needed a way to specifically monitor our workers' performance, and that turned out to be a bit of a challenge on its own without having to install and maintain the Open Swoole Dashboard on our server. I generally prefer to keep third-party applications that have an exposed front-end to a minimum unless absolutely necessary.

Eventually, I found a solution — and it was surprisingly simple — but it did take a bit of time and tinkering to get there.

Within the Swooles documentation, I found out that I could actually get the stats of the server by using the following:\
`OpenSwoole\Server->stats(int $mode = \OpenSwoole\Constant::STATS_DEFAULT): string|array|false`

This function gave me exactly the information I needed. It provided a clear view of our system's performance by showing the total number of connections, the number of active workers, and the number of connections waiting in the queue.

With these insights, I could easily identify when our workers were reaching their limit and when connections started to back up. This information was incredibly valuable, enabling me to quickly decide when to scale up our resources.

I ran into a challenge while working with Laravel Octane. Because I was using Octane instead of directly using OpenSwoole, I didn't have access to the `OpenSwoole\Server` object, which I needed for the task. 

After a bit of tinkering, I eventually discovered the solution was to access `\Swoole\Http\Server::class` using the `app()` helper function. 

`app()->get(\Swoole\Http\Server::class)->stats(1)`

By including this information in a HTTP response, I could immediately see the server’s statistics in a neatly formatted JSON format. This made the data easy to read and understand, and it allowed me to quickly assess the server’s performance at a glance.

`return response()->json(app()->get(\Swoole\Http\Server::class)->stats(1));`

The JSON response gave me exactly what I was looking for. It provided a clear view of the system’s performance, showing when the workers were hitting their capacity and when connections were starting to queue. This information was invaluable for understanding our resource usage and spotting potential bottlenecks.

```
connection_num	60
abort_count	0
accept_count	43526592
close_count	43526570
worker_num	8
task_worker_num	8
user_worker_num	0
idle_worker_num	0
...
```

When I reviewed the response, the problem became clear right away. The connection count was at **60**, while the worker count was only **8**. This imbalance meant the workers were maxed out, causing incoming connections to be queued.

What really caught my attention was the worker count itself. I distinctly remembered setting it to **32** in the `octane.php` configuration file (as explained above), so why was it showing only **8**?

After reviewing the Octane documentation again, I realised that it was stated that `octane:reload` only gracefully reloads the existing workers. My smooth brain overlooked the fact that this also meant it doesn't create new workers. Had I not used `app()->get(\Swoole\Http\Server::class)->stats(1)` to obtain this information, I might not have realised the workers were not being created as expected. Admittedly, this one is on me.

With this issue in particular, my foolishness aside, I think a lot of it was to do with our server and deployment set up. Within the Laravel Octane documentation, it  allows you to specify how many workers when starting the Octane server, like so:

```
php artisan octane:start --workers=4
```

However, since we use Laravel Forge to manage this, it creates a daemon that ensures Octane is always running using the command `php8.3 artisan octane:start --no-interaction --port=8000`. This means the `--workers` flag isn't used, and the number of workers is determined by the setting in the `octane.php` file, which led me to believe that `octane:reload` would be sufficient.

If the daemon wasn’t used and I had started the server with the `--workers` flag, I could have set the number of workers directly when re-launching the server, which would have completely avoided this issue.

All in all, as a result of using `app()->get(\Swoole\Http\Server::class)->stats(1)`, I was able to identify the following:

- Only **8** workers were active instead of the expected number of **32**. I later learned that `octane:reload` doesn't create new workers.
- Despite setting our worker count to **32**, it still would not be enough to handle the load. Our server was receiving more connections than the available workers could handle.

To address these problems, I took two immediate actions:

- I increased our server's vCPU count from **16** to **32**, allowing us to safely raise the number of workers to **64** without any adverse effects. (I decided against increasing it to 128 for now, as I wanted to monitor the server's performance with the new settings first.)
- By restarting the Laravel Octane server, I successfully created the new workers, significantly improving our ability to handle incoming connections.

### Sharing data between instances

One challenge I encountered with Octane, as mentioned above, is its ability to keep the application in memory. This can result in unintended data sharing between requests if not carefully managed.

Even though I had thoroughly reviewed and updated the codebase to eliminate the use of static variables and singletons, I still ran into an unexpected issue. Despite my efforts, I found that some data was still being shared between different requests. 

I ran into an issue with how we were setting up our app based on the requests coming in. Our game operates in two different modes: "app" mode and "web" mode. Which mode is active depends on how the user is accessing the game - via the iOS or Android app, or via the Web App.

This setup lets us tailor the look and functionality of the game depending on whether someone is using the web version or the app version. We handled this by using middleware that checks the domain of each request and sets the right configuration automatically like so:

```
if($request->getHost() === 'app.idle-mmo.com') {
    config(['game.mode' => \App\Enums\GameMode::APP]);
}

return $next($request);
```

You might have noticed a couple of potential issues in the code. For starters, it's generally not a good idea to use the config helper to dynamically set configuration settings in situations like this. But let’s put that aside for now.

More importantly, we ran into an issue because we didn’t explicitly set the game mode to `WEB` in the middleware. We thought this was fine because the default was already set to `\App\Enums\GameMode::WEB`, but that turned out to be a problem. I overlooked the fact that the setting would persist across requests.

When a worker processed a request from `app.idle-mmo.com`, it would set the configuration to `\App\Enums\GameMode::APP`. However, this setting persisted across subsequent requests handled by the same worker. As a result, all following requests were processed in `APP` mode, regardless of their origin.

The core of the problem was that there was no way to revert the configuration back to the default `WEB` mode after handling a request. The only way for it to reset was to wait for the worker process to restart - which only happened once the worker had reached the end of its lifecycle. In our case, because we didn't explicitly set a value to `max_requests`, the worker wouldn't restart. Instead, it would keep processing requests indefinitely (or up until the point we run `octane:reload` during our deployment process).

I fixed the issue by binding the game mode directly to the request itself, which completely avoided the problem since the request object is unique to each request.

```
$request->attributes->set('game_mode', \App\Enums\GameMode::APP);
```

Even though this was a minor oversight with luckily minimal impact, it’s a great example of how things can go wrong if data isn’t handled properly between requests. It also shows that even seasoned developers can slip up when working with Octane. This situation really drives home the need for careful coding practices and thorough testing, especially when it comes to managing data persistence.

### Race condition on a heavy operation

The most serious issue I dealt with was a critical problem that once caused our server to crash for several hours. 

The core of the problem was a very resource-intensive operation within our application. We didn’t realize it at the time, but this operation was susceptible to race conditions. These concurrent executions were quietly wreaking havoc on our system's stability and performance.

This issue had actually been in our code from the very start, but it only became a real problem when we saw spikes in traffic.

Basically, we had a way to check how many players were currently active in the game by calling a function like `activePlayers()`. This function would calculate the number of active players using a heavy database query.

To improve performance, we decided to cache the result of this query for 5 minutes. Since the number of active players doesn’t change drastically in a short period, this approach made sense. The heavy calculation only had to be done once every 5 minutes, which reduced the load on our system while still giving us reasonably up-to-date information.

The problem came up when the cache expired and a bunch of requests hit the server at the same time. Octane’s strength in handling a high volume of requests actually made our code more prone to race conditions in this situation.

This situation caused multiple requests to try calculating the number of active players in the game at the same time. Ironically, increasing the number of workers made things even worse. With 68 workers, we had up to 68 separate requests potentially trying to perform this calculation all at once. While the chances of all 68 workers hitting the same endpoint at the same time were slim, even just 10 or 20 simultaneous requests were enough to bog down the workers and cause the rest of the connections to queue up - especially because this also caused a bottleneck on our MySQL server.

Basically, this heavy operation was being run multiple times at the exact same moment. The server struggled to keep up with the load, often getting overwhelmed and occasionally crashing completely.

I came up with a simple fix to solve the issue. I added a lock to the operation that calculates the number of active players, making sure that it can only run once. While the calculation is in progress, any additional requests for this information just get a default value of zero. This solution stays in place until the lock is released, allowing the next query to go through. This approach effectively prevents multiple calculations from happening at once and helps keep the system stable.


It went from this:
```
Cache::get('active_players', function() {
    return $this->getActivePlayers();
});

function getActivePlayers(): int
{
    // Heavy operation. The below query is an extremely simplified version of the actual query.
    return User::where('last_active', '>', now()->subMinutes(5))->count();
}
```

To this:
```
return Cache::lock('active_players')->get(function() {
    return $this->getActivePlayers();
});
function getActivePlayers(): int
{
    return Cache::lock('active_players_query_lock')->get(function() {
        // Heavy operation. The below query is an extremely simplified version of the actual query.
        return User::where('last_active', '>', now()->subMinutes(5))->count();
    }) ?? 0;
}
```

This solution completely fixed our problem — no more server hiccups. The only downside is that a a very small number of users might see "0" as their active player count for a short period, but that’s a small trade-off for the stability and performance we’ve gained. We’re planning to implement a more robust solution soon by placing the calculation in a queue and processing it asynchronously. This way, the system can handle the heavy operation without impacting the user experience.

## Conclusion

Laravel Octane has been a game-changer for scaling our Laravel application. It’s allowed us to handle an incredible volume of requests with far fewer resources than PHP-FPM, which has not only saved us a lot on server costs but also **significantly** boosted our user capacity. Simply put, Laravel Octane with Swoole has pushed our application to perform better than we ever expected, making it an essential tool for our scaling needs.

Right now, our single nginx server is handling circa 35 million requests per day on a single 32 vCPU server with no signs of slowing down. As we have identified the major bottlenecks and updated the configuration, I feel that it could easily handle 50 million requests per day. Other web apps, with similar traffic but less resource-intensive operations, could handle substantially more than that.

In the end, while the limited online resources made it tricky to implement Laravel Octane smoothly, we actually didn’t run into any major problems — except for it exposing a severe bottleneck in our code (Obviously I don't blame Octane for that). 

Some of these issues could’ve been resolved much faster if they were officially documented - especially Octane persisting MySQL connections by default. But whether they should be or not isn’t for me to decide. I have no idea what the criteria is for what gets officially documented and what doesn’t. I’m just a simpleton sharing the challenges I’ve faced with Laravel Octane because there wasn’t much info online. I guess, in a way, having to discover these issues on my own made things much more interesting.

In the end, I highly recommend Laravel Octane to anyone looking to scale their Laravel application. It’s an amazing tool that’s enabled us to handle an incredible number of requests with far fewer resources than we would have needed with the traditional setups like PHP-FPM or Apache mod-php.

If I were to boil it down to a few key points, it would be the following:
- Be _extremely_ careful about sharing data between requests. It is very easy to do and can cause a lot of issues - especially if the data is sensitive.
- Enabling octane literally supercharges your application that it ends up reaching a lot of the pre-set limits of the server. Be prepared to increase those limits.
- Making a hard restart of the Octane server is needed every time you change the number of workers in the `octane.php` file. `octane:reload` only reloads the existing workers.
- `app()->get(\Swoole\Http\Server::class)->stats(1);` is your best friend. Use it to see the stats of the server and when the workers are being maxed out.
- Be extremely mindful of any extremely heavy operations/queries that are susceptible to race conditions - especially when the server is supercharged to handle a lot more requests. Preferably, move these operations to a queue so they don't impact the user experience at all.