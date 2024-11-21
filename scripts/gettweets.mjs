import { Scraper } from "agent-twitter-client";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const TWEETS_FILE = "tweets.json";

(async () => {
    try {
        // Create a new instance of the Scraper
        const scraper = new Scraper();

        // Log in to Twitter using the configured environment variables
        await scraper.login(
            process.env.TWITTER_USERNAME,
            process.env.TWITTER_PASSWORD,
            process.env.TWITTER_EMAIL,
            process.env.TWITTER_2FA_SECRET,
            process.env.TWITTER_API_KEY,
            process.env.TWITTER_API_SECRET_KEY,
            process.env.TWITTER_ACCESS_TOKEN,
            process.env.TWITTER_ACCESS_TOKEN_SECRET
        );

        // Check if login was successful
        if (await scraper.isLoggedIn()) {
            console.log("Logged in successfully!");

            const hasV2Settings =
                this.runtime.getSetting("TWITTER_API_KEY") &&
                this.runtime.getSetting("TWITTER_API_SECRET_KEY") &&
                this.runtime.getSetting("TWITTER_ACCESS_TOKEN") &&
                this.runtime.getSetting("TWITTER_ACCESS_TOKEN_SECRET");
            // Fetch all tweets for the user "@realdonaldtrump"
            const tweets = hasV2Settings
                ? await scraper.getTweetsV2("pmarca", 2000)
                : await scraper.getTweets("pmarca", 2000);

            // Initialize an empty array to store the fetched tweets
            let fetchedTweets = [];

            // Load existing tweets from the JSON file if it exists
            if (fs.existsSync(TWEETS_FILE)) {
                const fileContent = fs.readFileSync(TWEETS_FILE, "utf-8");
                fetchedTweets = JSON.parse(fileContent);
            }

            // skip first 200

            let count = 0;

            // Fetch and process tweets
            for await (const tweet of tweets) {
                if (count < 1000) {
                    count++;
                    continue;
                }

                console.log("--------------------");
                console.log("Tweet ID:", tweet.id);
                console.log("Text:", tweet.text);
                console.log("Created At:", tweet.createdAt);
                console.log("Retweets:", tweet.retweetCount);
                console.log("Likes:", tweet.likeCount);
                console.log("--------------------");

                // Add the new tweet to the fetched tweets array
                fetchedTweets.push(tweet);

                // Save the updated fetched tweets to the JSON file
                fs.writeFileSync(
                    TWEETS_FILE,
                    JSON.stringify(fetchedTweets, null, 2)
                );
            }

            console.log("All tweets fetched and saved to", TWEETS_FILE);

            // Log out from Twitter
            await scraper.logout();
            console.log("Logged out successfully!");
        } else {
            console.log("Login failed. Please check your credentials.");
        }
    } catch (error) {
        console.error("An error occurred:", error);
    }
})();
