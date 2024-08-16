# From Zero to 35M: The struggles of scaling Laravel Octane

This blog post aims to share our experience using Laravel Octane with OpenSwoole to scale our system, enabling it to handle more tajam 35 million requests per day. I'll also discuss the challenges we encountered as a direct result of this increased traffic.

Before diving into the technical details of our journey, let me provide some context about our application and its functionality. This background information will help you better understand the issues we faced and the solutions we implemented.

## The Application

IdleMMO is an online multiplayer game developed using Laravel and Alpine.js. Since its public release in December 2023, it has experienced explosive growth, attracting over 160,000 users – with the majority joining in just the last two months. This rapid expansion has presented us with unprecedented scaling challenges.

While I've previously written about scaling issues in my other project, SimpleMMO, the scale and intensity of IdleMMO's growth have far surpassed anything we've encountered before. This unique situation has pushed us to explore new solutions and optimize our infrastructure in ways we hadn't anticipated.

## Initial Set Up

When we first launched the project, our infrastructure was relatively straightforward. We used NGINX as our web server, MySQL for our database, Redis for caching, and Laravel Horizon for managing our queues. This setup served us well for the first 3 to 4 months after the game went live. 

During this period, we were only gaining a few hundred new users per day, which our system could handle comfortably without overextending our resources. We considered this growth rate reasonable and manageable. 

However, everything changed when we released the game on the Google Play Store. We experienced a massive surge in user acquisition, jumping from a few hundred new users per day to several thousand. This dramatic increase in traffic quickly exposed the limitations of our initial setup. It became evident that our current infrastructure wouldn't be able to handle this unexpected load, prompting us to reevaluate and upgrade our system to meet the new demands.

## The Problem

The core issue we faced was that our existing setup couldn't cope with the sheer volume of incoming requests. PHP-FPM, our initial choice, was struggling to manage this increased load without a substantial investment in our infrastructure, particularly in server capacity.

Even with significant financial input, we realized that PHP-FPM alone wouldn't suffice to handle our new traffic levels. We began to consider more complex solutions, such as distributing our servers and implementing load balancing techniques.

It became clear that we needed to explore alternative approaches to efficiently scale our system without incurring prohibitive costs or overly complicating our architecture.

## The Solution

Enter Laravel Octane - marketed as a way to supercharge a Laravel application. It promised to handle more requests with fewer resources, which sounded exactly like what we needed. Intrigued by its potential, we decided to give it a try.

The results were immediate and incredible. You know the saying "if it's too good to be true, it probably is"? Well, in this case, it actually was true. Our performance increased significantly, and we were suddenly able to handle a staggering amount of new users.

The impact was clearly visible in our application performance metrics. According to our application package manager (Sentry.io), we saw a dramatic improvement in response times. The 95th percentile of users experienced a drop from an average of **450ms** to just **172ms**. This was a massive improvement that left me in awe.

[ Insert image of Sentry.io response time ]

## Why Laravel Octane worked so well

The remarkable success of Laravel Octane for our project can be attributed to its foundation on Swoole, a high-performance, coroutine-based PHP framework. This powerful combination allowed us to handle a significantly higher volume of requests while using fewer resources.

Swoole's key advantage lies in its approach to application bootstrapping. Unlike PHP-FPM, which initializes the Laravel application for each incoming request, Swoole bootstraps the application once and keeps it in memory. This fundamental difference eliminates the need for repeated bootstrapping, dramatically reducing overhead and allowing Laravel Octane to process many more requests than traditional PHP-FPM setups.

This efficient memory management and reduced initialization overhead are the primary reasons why Laravel Octane was able to deliver such impressive performance improvements for our application.

The performance gains from this approach are indeed significant. However, this optimization comes with its own set of challenges. Since the application doesn't need to be bootstrapped for each request, we had to be particularly cautious about our use of static variables and singletons.

Misusing these elements could lead to unintended data sharing between requests, which is precisely what we wanted to avoid. For instance, if Request A sets a static variable, Request B might see that same variable if it's being handled by the same worker. This scenario breaks the principle of request isolation that we aimed to maintain.

Our goal was to ensure that each request is handled in complete isolation, preserving the integrity and security of our application. This required a careful review of our codebase and a thoughtful approach to state management within our application. We had to rethink how we used certain PHP features to fully leverage the benefits of Laravel Octane while avoiding potential pitfalls associated with persistent application states.

We actually encountered this issue firsthand, which I'll delve into later to provide a real-world example of how it can manifest.

Naively, we thought transitioning to Laravel Octane would be a breeze. After all, the Laravel documentation primarily highlighted this one issue, and we were confident that we weren't using static variables, singletons, or any other form of global state in our application. We asked ourselves, "What could possibly go wrong?"

As it turns out, quite a lot could and did go wrong. Fortunately, none of the issues we faced were catastrophic, but they did present us with a series of small yet persistent headaches. These unforeseen challenges taught us that even when you think you've covered all your bases, the complexities of scaling and optimizing a large application can surprise you in unexpected ways.

## The Problems with Octane

One challenge we faced with Octane was the relative scarcity of documentation compared to more established technologies like PHP-FPM or Apache mod_php. The internet offered limited resources on how to correctly implement and scale Octane and Swoole, which left us somewhat in the dark. As a result, OpenSwoole's documentation became my constant companion and most valuable resource over the following months.

This lack of comprehensive guidance meant that we encountered numerous issues with Octane that proved to be quite troublesome to resolve. Many of these problems were either completely undocumented or required extensive research and experimentation to address. It was a period of intense learning and problem-solving, as we navigated the uncharted waters of scaling our application with these newer technologies.

Despite the challenges, this experience pushed us to dive deeper into the intricacies of Octane and Swoole, ultimately leading to a more profound understanding of our system's architecture and performance characteristics.

### Database Transaction Issues

In our initial setup, we had made the decision to disable persistent database connections in our Laravel configuration. To be honest, I'm not entirely certain about the reasoning behind this choice, as it was made quite some time ago and the specifics have become a bit hazy in my memory. Regardless, this was the configuration we were working with.

However, we soon discovered an interesting quirk with Laravel Octane. Despite our explicit configuration to disable persistent connections, Octane disregarded this setting. Instead, it maintained persistent database connections across requests, contradicting our specified preferences in the database configuration file.

This behavior caught us off guard and highlighted an important aspect of working with Octane: it doesn't always adhere to the standard Laravel configuration options. This realization prompted us to reassess our understanding of how Octane interacts with various Laravel settings and forced us to adapt our approach to database connection management.

While Octane's approach to maintaining database connections in memory aligns with its goal of supercharging application performance, we encountered an unexpected issue that wasn't documented anywhere.

Upon enabling Laravel Octane, we began experiencing numerous problems with database transaction savepoints, specifically encountering "1305 SAVEPOINT does not exist" errors. Although I'm not an expert in MySQL's inner workings, my hypothesis is that these errors occurred because database connections were being persisted across requests. This meant that a savepoint created in one request could potentially interfere with another request, leading to these errors.

This issue caused us significant frustration for several days, primarily because we were unaware that database connections were being persisted across requests. After all, we had explicitly disabled this feature in our configuration file.

The breakthrough came unexpectedly when one of Laravel Octane's developers mentioned in passing that connections persist by default, a comment they had made in a YouTube video. This led me to investigate the Octane configuration file, where I discovered a commented-out class `DisconnectFromDatabases::class` within the `OperationTerminated` event. Simply uncommenting this line resolved our transaction issues.

The lack of clear documentation on this behavior cost us valuable time in diagnosing and resolving the problem. Had this information been readily available in the Octane documentation, we could have avoided days of troubleshooting. This experience underscores the importance of comprehensive documentation, especially for newer technologies like Octane.

### Worker Connections were not enough

Laravel Octane significantly improved our application's ability to handle more requests. However, this efficiency led us to an unexpected challenge: we quickly reached our maximum `worker_connections` limit.

It's important to note that this wasn't a flaw in Octane itself. We likely would have encountered the same issue with PHP-FPM eventually. Octane's superior performance simply brought us to this limit faster than we anticipated.

Fortunately, the solution was straightforward. We increased the `worker_connections` value in our `nginx.conf` file. While this was a simple fix, it highlighted the importance of adjusting our infrastructure to match the improved performance Octane provides.

### Reaching the limit of open file descriptors

After resolving the initial issue, we encountered a new challenge: we quickly reached the limit of open file descriptors. This was due to the high number of concurrent requests that Laravel Octane allowed us to handle. As we increased the worker connections, the Nginx process was permitted to open more files simultaneously.

Much like the `worker_connections` issue, it's important to note that this isn't specifically an Octane problem; we likely would have faced this issue with PHP-FPM as well.

The file descriptor limit is actually a security feature implemented by the operating system. It prevents a single process, like Nginx, from opening too many files and potentially exhausting system resources.

In our case, the default system limit for file descriptors was set too low at `1024`, which is insufficient for high-traffic scenarios – precisely the kind of situations that Laravel Octane is designed to handle.

As a temporary solution, I increased the limit to `65535` by running the command: `ulimit -n 65536`. However, I recognized that this was not a permanent fix, as the setting would revert upon system reboot. A more long-term solution would need to be implemented to address this issue effectively.

The long term solution was to increase the limit permanently. This was done by doing the following:

Opening the `/etc/security/limits.conf` file add the following lines to the file:
```
* soft nofile 65536 
* hard nofile 65536
```

Opening the `/etc/pam.d/common-session` file and add the following line to the file:
```
session required pam_limits.so
```

Opening the `/etc/pam.d/common-session-noninteractive` file and add the following line to the file:
```
session required pam_limits.so
```

Opening the `/etc/sysctl.conf` file and add the following line to the file:
```
fs.file-max = 2097152
```

Opening the `/etc/nginx/nginx.conf` file and add the following line to the file:
```
worker_rlimit_nofile 65536;
```

After doing this, I restarted the server and the limit was permanently increased. No more file descriptor errors.

### Swoole Workers

OpenSwoole operates on a simple principle: it creates multiple workers to handle incoming user connections. When a user connects, their request is assigned to an available worker. Once the worker completes the request, it's ready to handle another.

However, there's an important consideration: the number of workers is closely related to the server's vCPU count. Best practices suggest using 1 to 4 workers per vCPU. This recommendation exists because each worker can only handle one request at a time. If you have more workers than vCPUs, they may compete for resources, potentially leading to decreased performance.

This concept is well-documented in the OpenSwoole documentation. For those using Laravel Octane, you can manually configure Swoole settings by modifying the octane.php file. Simply add your desired Swoole options within the following structure:

```
'swoole' => [
    'options' => [
        // Swoole options go here
    ],
],
```

Based on my previous experience with web systems, I decided to increase the number of workers to accommodate traffic spikes. This approach is particularly relevant for our application, which is an MMORPG and naturally experiences frequent fluctuations in user activity.

Following OpenSwoole's documentation, which recommends a ratio of **1** to **4** workers per vCPU, we configured our **8** vCPU server to run **32** workers. This setup allowed us to maximize our server's capacity while staying within the recommended guidelines.

By implementing these optimizations, we aimed to enhance our server's ability to handle sudden increases in traffic, ensuring a smoother experience for our players during peak usage times.

```
    'swoole' => [
        'options' => [
            'worker_num' => env('SWOOLE_WORKER_NUM', swoole_cpu_num()),
        ],
    ],
```

Initially, I thought I had everything under control. The environment file allowed me to easily adjust the number of workers used by the server, which seemed ideal for scaling our resources up or down as needed.

However, a challenge arose: determining the right time to make these adjustments. It's not straightforward to identify when the number of connections is approaching the worker limit.

The system's behavior adds to this complexity. When all workers are occupied and a new request comes in, that request is queued. While this process works, there's no simple way to monitor or gather information about these queued requests.

This lack of visibility into the queuing process makes it difficult to proactively manage our server resources and ensure optimal performance.

We use Sentry.io as our application monitoring tool, which provides valuable insights into incoming requests, including response times. This information helps us detect potential issues with our application.

However, there's a limitation with Sentry's functionality. It only begins tracking a request once Swoole, our server software, picks up the connection and starts processing it. This means that if a request is queued before being processed, Sentry doesn't account for that waiting time.

From Sentry's perspective, everything appears to be working correctly because it only sees the processing time once the request is picked up. But this doesn't reflect the user's experience accurately.

The real issue is that a user might send a request and wait for a long time before receiving a response, due to queuing. Meanwhile, our monitoring tools show that everything is functioning normally because they don't capture the queuing delay.

This discrepancy between the user experience and our monitoring data creates a blind spot in our ability to detect and address performance issues effectively.

Finding a solution to monitor our workers' performance was quite challenging. We needed a simple method to check if our workers were reaching their capacity without resorting to installing and maintaining the Open Swoole Dashboard on our server. As a general practice, we try to minimize the use of third-party applications on our servers unless absolutely necessary.

Although we eventually discovered a solution — which turned out to be remarkably straightforward — it wasn't documented anywhere. 

Within the Swooles documentation, we found out that we could actually get the stats of the server by using the following:\
`OpenSwoole\Server->stats(int $mode = \OpenSwoole\Constant::STATS_DEFAULT): string|array|false`

This function provided us with precisely the information we needed. It gave us a clear picture of our system's performance by showing the total number of connections, the number of active workers, and the number of connections waiting in the queue.

With these insights, we could pinpoint exactly when our workers were reaching their maximum capacity and when connections started to pile up. This information was incredibly valuable, as it allowed us to quickly determine when we needed to increase our workforce. Overall, this function proved to be an enormous help in optimizing our system's efficiency.

I encountered a challenge while working with Laravel Octane. Since we were using Octane instead of OpenSwoole directly, we didn't have access to the OpenSwoole\Server object, which was necessary for our task. This limitation was frustrating and left me searching for a solution.

I eventually discovered the solution was to access it through the app() helper function. 

`app()->get(\Swoole\Http\Server::class)->stats(1)`

It's really that simple. By returning this information in our response, we can now view the server's statistics in a neatly formatted JSON format. This makes the data easy to read and understand, allowing us to quickly assess the server's performance at a glance.

`return response()->json(app()->get(\Swoole\Http\Server::class)->stats(1));`

The JSON response provided exactly what I was looking for. It gave me a clear picture of the system's performance, showing me when the workers were reaching their maximum capacity and at what points connections were being queued. This information was invaluable for understanding our resource utilization and identifying potential bottlenecks.

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

Upon reviewing the response, I quickly identified the problem. The connection number was at 60, while the worker number was only 8. This imbalance meant that the workers were operating at full capacity, causing incoming connections to be queued.

What caught my attention, however, was the worker number itself. I distinctly remembered setting it to 32 in the `octane.php` configuration file. So why was it showing 8?

After some investigation, I discovered an important detail about the `octane:reload` command. It only refreshes the existing workers but doesn't create new ones. This realization was frustrating, as it meant I had to completely restart the server to generate the additional workers I needed.

After analyzing the data from the stats function, I discovered two critical issues:

- Despite setting the worker count to **32** in the octane.php file, only **8** workers were active. I later learned that `octane:reload` doesn't create new workers.
- Our server was receiving more connections than the available workers could handle, resulting in a connection queue.

To address these problems, we took two immediate actions:

- We increased our server's vCPU count from **16** to **32**, allowing us to safely raise the number of workers to **128** without any adverse effects.
- By restarting the Laravel Octane server, we successfully created the new workers, significantly improving our ability to handle incoming connections.

### Sharing data between instances

One of the main challenges we faced with Octane, as previously discussed, is its tendency to keep the application in memory. This characteristic can lead to unintended data sharing between requests if not properly managed.

Although we had already thoroughly reviewed and updated the codebase to eliminate the use of static variables and singletons, we still encountered an unexpected issue. Despite our efforts, we discovered that some data was still being shared between different requests. This situation highlighted the need for further investigation and refinement of our approach to ensure complete data isolation between requests in the Octane environment.

We encountered an issue related to how we were dynamically configuring our application based on incoming requests. Our system has two modes of operation: "app" mode and "web" mode. The active mode is determined by the domain through which the user accesses the game - either app.idle-mmo.com or web.idle-mmo.com.

This configuration allows us to customize the appearance and functionality of the game depending on whether the user is accessing the web version or the app version. We implemented this feature using middleware, which checks the domain of each request and sets the appropriate configuration accordingly.

The approach we used in our middleware allowed us to dynamically adjust the game's interface and behavior based on the access point, providing a tailored experience for both web and app users.

```
if($request->getHost() === 'app.idle-mmo.com') {
    config(['game.mode' => \App\Enums\GameMode::APP]);
}

return $next($request);
```

You might have spotted a couple of issues in the code. First, it's worth noting that using the config helper to dynamically set configuration settings is generally not recommended. However, let's set that aside for now.

More importantly, we didn't explicitly set the app.mode in the middleware because our default value was already set to `\App\Enums\GameMode::WEB`. This oversight could potentially lead to unexpected behavior in our application.

When a worker processed a request from `app.idle-mmo.com`, it would set the configuration to `\App\Enums\GameMode::web`. However, this setting persisted across subsequent requests handled by the same worker. As a result, all following requests were processed in `APP` mode, regardless of their origin.

The problem was that there was no mechanism to revert the configuration back to the default `WEB` mode. The only way to reset it was to terminate the worker and start a new one. This issue arose because the configuration setting was being maintained across multiple requests, instead of being reset after each one.

I solved this by binding the application mode to the request itself thus avoiding the issue entirely because the request is not persisted across requests.

```
$request->attributes->set('app_mode', AppMode::APP);
```

This incident, although a minor oversight with fortunately minimal consequences, serves as an excellent illustration of the potential risks associated with improper data handling between requests. It also highlights how even experienced developers can easily make mistakes when working with Octane. This situation underscores the importance of careful coding practices and thorough testing, especially when dealing with data persistence and request handling in web applications.

### Race condition on a heavy operation

The most severe problem we faced turned out to be a critical issue that once caused our server to crash for several hours. What made it particularly challenging was the difficulty in identifying its root cause.

At the heart of the problem was an extremely resource-intensive operation within our application. Unknown to us at the time, this operation was vulnerable to race conditions. These concurrent execution conflicts were silently undermining our system's stability and performance.

This problem had actually been in the code since the beginning, it's only because of the massively increased traffic that it became an issue.

Basically, there was a way for us to access the number of players that were currently active in the game by calling a function such as `activePlayers()`. This function contained an operation that calculated the number of active players in the game using a query.

To optimize performance, we implemented a caching system for this function. The result of the query would be stored in cache for 5 minutes before being recalculated. This approach was suitable because the number of active players doesn't fluctuate rapidly. As a result, the heavy calculation would only need to be performed once every 5 minutes, significantly reducing the load on our system while still providing reasonably up-to-date information.

A problem emerged when the cache expired and multiple requests flooded in simultaneously. The Octane server's impressive ability to handle a large volume of requests actually made the code more vulnerable to race conditions.

This situation led to multiple requests attempting to calculate the number of active players in the game at the same time. We had increased the number of workers to **128**, which meant that potentially **128** separate requests could be trying to perform this calculation simultaneously. This issue became immediately apparent as soon as we implemented the increased worker count.

In essence, this resource-intensive operation was being executed nearly 100 times simultaneously. As a result, the server was struggling to keep up with the demand, often becoming overwhelmed and occasionally crashing altogether.

We implemented a straightforward fix to address the issue. By adding a lock to the operation that calculates the number of active players, we ensured that only one query could be executed at a time. When the calculation is in progress, any additional requests for this information receive a default value of zero. This temporary measure remains in place until the lock is released, allowing the next query to proceed. This solution effectively prevents concurrent calculations and maintains system stability.

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

This solved our problem entirely. No more server hiccups.

## Conclusion

Laravel Octane has proven to be an exceptional solution for scaling our Laravel application. Its implementation has yielded impressive results, enabling us to manage an astonishing volume of requests using significantly fewer resources compared to PHP-FPM. This efficiency has not only led to substantial savings in server costs but has also dramatically increased our user capacity. In essence, Laravel Octane has empowered our application to perform beyond our initial expectations, making it an invaluable tool for our scaling needs.

Despite our efforts, the limited online resources has made it challenging to implement the system smoothly. Although we haven't faced any significant problems, we've encountered several minor issues that have been time-consuming to resolve. These small hurdles have slowed our progress and required extra attention to detail.

Should these solutions have been in the documentation? That is not for me to decide. I'm just a simple moron outlining some of the issues I've faced with Laravel Octane simply because I didn't really see all that much online.  
After all, the pains of having to find out these issues yourself makes things much more interesting.

I must say, if some of these solutions had been included in the documentation, it would have saved me a considerable amount of time. This is especially true for the information about Octane's default configuration is to persist database connections across multiple requests. Having this knowledge upfront would have been incredibly helpful.

Ultimately, I recommend Laravel Octane to anyone who is looking to scale their Laravel application. It is a fantastic tool that has allowed us to handle a staggering amount of requests with a lot less resources than we would have needed with the traditional way such as PHP-FPM or Apache mod-php.

If I were to boil it down to a few key points, it would be the following:
- Be _extremely_ careful about sharing data between requests. It is very easy to do and can cause a lot of issues - especially if the data is sensitive.
- Enabling octane literally supercharges your application that it ends up reaching a lot of the pre-set limits of the server. Be prepared to increase the limits of the server.
- Making a hard restart of the octane server is needed _every_ time you change the number of workers in the `octane.php` file. `octane:reload` only reloads the existing workers.
- `app()->get(\Swoole\Http\Server::class)->stats(1);` is your best friend. Use it to see the stats of the server and when the workers are being maxed out.
- Be mindful of any extremely heavy operations/queries that are susceptible to race conditions - especially when the server is supercharged to handle a lot more requests.