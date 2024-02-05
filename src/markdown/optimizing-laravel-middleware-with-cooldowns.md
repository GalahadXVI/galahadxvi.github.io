# Optimizing Laravel Middleware with Cooldowns

In my development work, I frequently incorporate cooldown mechanisms into middleware. This practice is essential because certain code blocks, when executed on every request, can lead to significant performance issues.

The primary objective of implementing a cooldown is to prevent the middleware from executing on every single request.

### Why would you do this?

Beyond performance considerations, there are scenarios where executing a specific block of code on every request doesn't yield any added value.

For example, in the projects I work on, I often store clients' IP addresses in the database as a measure to prevent abuse. This is achieved through middleware. Initially, I used to save the IP address in the database on every request if it didn't already exist. However, carrying out this operation with each request offered minimal benefits. The likelihood of a client's IP address changing between requests is exceedingly low, especially when clients send multiple concurrent requests with no time interval in between, which can lead to substantial performance issues.

To address this, I introduced a cooldown mechanism to the middleware. This modification effectively runs the 'check and save' process only once every 5 minutes.

### How to do this?

I simply used `Cache`.

```
Cache::remember("run_IP_check_middleware_".auth()->user()->id, function(){
    //Check the users IP address here
}, now()->addMinutes(5));
```

This process essentially checks whether the closure within the cached item `run_IP_check_middleware_[USERID]` has been executed in the last 5 minutes. If it hasn't (meaning the cache doesn't exist), it proceeds to run the closure.

### Taking it to the next level

This implementation works well for occasional cooldowns. However, what if you have multiple middleware components that require cooldowns? While you could manually apply the above approach to each middleware class, it can become cumbersome. Not only does it look a bit messy to wrap the logic in a closure each time you want to introduce a cooldown, but it also becomes challenging to maintain when you want to enhance the way the check is performed.

To take it to the next level, you can create an abstract class. Similar to an interface class, an abstract class is a class that can be extended, forcing the extending classes to include certain elements. However, the key difference is that an abstract class can contain shared logic, reducing code duplication.

By using an abstract class, you can streamline the process of adding cooldowns to middleware, reduce redundant code, and make it more convenient to manage cooldown logic.

To begin, let's create our abstract class.

__app\Abstracts\MiddlewareCooldown.php__
```
<?php

namespace App\Abstracts;

use Illuminate\Support\Facades\Cache;

abstract class MiddlewareCooldown
{
}
```

Our first step is to declare the initial variables that will determine the duration of the cooldown.

The value we set here serves as the default. If any extending classes neglect to specify their own cooldown duration, it will default to 60,000 milliseconds (60 seconds).

```
    /**
     * The cooldown time in milliseconds.
     */
    protected int $cooldown = 60000;
```

Next, we'll create a method to determine whether the middleware's cooldown is currently active.

The implementation is straightforward. We check for the existence of the cache. If it exists, we return true; if not, we create a cache entry for the duration of the cooldown and return false.

This function's sole purpose is to check the cooldown's status; it doesn't handle any additional middleware logic, which will be managed within the middleware itself.

```
    /**
     * Check if the middleware is on cooldown.
     * 
     * @return bool
     */
    protected function isOnCooldown() : bool
    {
        if(Cache::has($this->getCooldownKey()))
            return true;

        Cache::put($this->getCooldownKey(), true, now()->addMilliseconds($this->cooldown));

        return false;
    }
```

Finally, we must define a function that all extending classes will use to supply a unique cooldown key for the cache. This step is crucial because without this key, the MiddlewareCooldown class won't have the necessary information to identify which cache entry it should check.

```
    /**
     * Set the middleware cooldown key.
     *
     * @return string
     */
    abstract protected function getCooldownKey() : string;
```

This is the final result:

```
<?php

namespace App\Abstracts;

use Illuminate\Support\Facades\Cache;

abstract class MiddlewareCooldown
{

    /**
     * The cooldown time in milliseconds.
     */
    protected int $cooldown = 60000;

    /**
     * Check if the middleware is on cooldown.
     * 
     * @return bool
     */
    protected function isOnCooldown() : bool
    {
        if(Cache::has($this->getCooldownKey()))
            return true;

        Cache::put($this->getCooldownKey(), true, now()->addMilliseconds($this->cooldown));

        return false;
    }
    

    /**
     * Set the middleware cooldown key.
     *
     * @return string
     */
    abstract protected function getCooldownKey() : string;
}
```

After creating the abstract class, the implementation process becomes significantly more straightforward.

In our middleware class, we extend the MiddlewareCooldown class, specify the cache key and cooldown duration, and then check if the cooldown is active. If the cooldown is active, we exit early. If it's not active, we proceed to execute the remaining middleware logic.

```
use App\Abstracts\MiddlewareCooldown;

class CheckUserIP extends MiddlewareCooldown
{
    /**
     * The cooldown time in milliseconds.
     */
    protected int $cooldown;

    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        /**
         * Check if the middleware is on a cooldown. If it is then return early.
         **/
        if($this->isOnCooldown())
            return $next($request);

        //Perform your middleware logic here

        return $next($request);
    }

    /**
     * Set the middleware cooldown key.
     *
     * @return string
     */
    protected function getCooldownKey() : string
    {
        return "check_user_ip_middleware_".auth()->user()->id;
    }

}
```

### Race Conditions

Some keen observers might notice a potentially significant issue in the code - it lacks protection against race conditions. For those unfamiliar with the term, a race condition occurs when two requests run simultaneously, and both processes proceed independently because they are unaware of each other. While there are more intricacies to race conditions, this provides a general overview. The above code may suffice for the majority use cases, it's not suitable for mission-critical tasks or blocks of code that should only run once. 

To tackle this problem, we can employ the Cache::lock method, which leverages atomic locks to guarantee that the cache operation runs only once. Note that atomic locks are only supported by `memcached`, `redis`, `dynamodb`, `database`, `file`, or `array` cache drivers.

```
protected function isOnCooldown() : bool
{
    // Attempt to acquire the lock with a 10 second expiration and execute the closure if successful.
    $result = Cache::lock($this->getCooldownKey() . '_lock', 10)->get(function () {
        // Check if the cooldown is already set.
        if (Cache::has($this->getCooldownKey())) 
            return true;

        // Set the cooldown since it's not already set, and return false indicating no cooldown was active.
        Cache::put($this->getCooldownKey(), true, now()->addMilliseconds($this->cooldown));

        return false;
    });

    // If the lock could not be acquired or the cooldown is active, return true just to be safe.
    return $result ?? true;
}
```
