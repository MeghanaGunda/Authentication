const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let database = null;

const initializingDBAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB error message: ${error.message}`);
    process.exit(1);
  }
};

initializingDBAndServer();

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// REGISTER USER

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username LIKE '${username}';`;
  const user = await database.get(selectUserQuery);

  if (user === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `INSERT INTO user (name,username,password,gender) 
      VALUES ('${name}','${username}','${hashedPassword}','${gender}');`;
      const dbResponse = await database.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//USER LOGIN

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username= '${username}';`;
  const user = await database.get(selectUserQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const isPasswordMatched = await bcrypt.compare(password, user.password);
      if (isPasswordMatched === true) {
        const payload = { username: username };
        const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
        response.send({ jwtToken });
      } else {
        response.status(400);
        response.send("Invalid password");
      }
    }
  }
});

//GET latest tweets of user following content

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  //const { user } = request.params;
  const latestTweetsQuery = `SELECT user.username, tweet.tweet,tweet.date_time
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
  //WHERE tweet.user_id = follower.following_user_id
  const latestTweets = await database.all(latestTweetsQuery);
  response.send(latestTweets);
});

//LIST OF ALL NAMES A USER IS FOLLOWING

app.get("/user/following/", authentication, async (request, response) => {
  const listOfFollowingQuery = `
    SELECT user.username
    FROM follower INNER JOIN user ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = 1;`;

  const list = await database.all(listOfFollowingQuery);
  response.send(list);
});

// LIST OF ALL FOLLOWERS NAMES A USER HAS

app.get("/user/followers/", authentication, async (request, response) => {
  const listOfFollowersQuery = `
    SELECT user.username
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id=2;`;

  const list = await database.all(listOfFollowersQuery);
  response.send(list);
});

//RETURNS TWEET BASED ON USER REQUEST AND TWEETID

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const followingIdListQuery = `
  SELECT follower_user_id FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
  WHERE user.username = '${username}';`;
  const followingList = await database.get(followingIdListQuery);
  const { follower_user_id } = followingList;
  if (followingList === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweetQuery = `
    SELECT tweet.tweet,SUM(like.tweet_id) AS likes, COUNT(reply.reply_id)AS replies, tweet.date_time
    FROM tweet INNER JOIN like ON tweet.tweet_id= like.tweet_id
    INNER JOIN reply ON like.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = ${tweetId}
    AND tweet.user_id IN (${follower_user_id});`;
    const tweet = await database.get(tweetQuery);
    response.send(tweet);
  }
});

//GET usernames who liked a tweet - 7 API

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const followingIdListQuery = `
        SELECT follower_user_id FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE user.username = '${username}';`;
    const followingList = await database.get(followingIdListQuery);
    const { follower_user_id } = followingList;
    if (followingList === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikedUsers = `SELECT user.username
      FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
       INNER JOIN follower ON follower.following_user_id = tweet.user_id
       INNER JOIN user ON like.user_id = user.user_id
      WHERE follower.follower_user_id = ${follower_user_id}
      GROUP BY user.username;`;
      const likedUsers = await database.all(getLikedUsers);

      let usernamesArray = [];

      response.send(usernamesArray);
    }
  }
);

//SHOULD WRITE - 8 API
//GET USER TWEETS -9 API

app.get("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;
  const getTweetsQuery = `
    SELECT tweet.tweet,COUNT(like.like_id) AS likes, COUNT(reply.reply_id) AS replies, tweet.date_time AS dateTime
    FROM tweet INNER JOIN user ON tweet.user_id = user.user_id
    INNER JOIN like ON tweet.tweet_id = like.tweet_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE user.username = '${username}'
    GROUP BY tweet.tweet;`;
  const tweets = await database.all(getTweetsQuery);
  response.send(tweets);
});

//CREATE A TWEET - 10 API

app.post("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const createTweetQuery = `
    INSERT INTO tweet (tweet)
    VALUES ('${tweet}');`;
  await database.run(createTweetQuery);
  response.send("Created a Tweet");
});

//DELETING A TWEET - 11API

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const checkTweetIdQuery = `SELECT tweet_id FROM tweet INNER JOIN user ON tweet.user_id = user.user_id
  WHERE user.username = '${username}'
  AND tweet.tweet_id = ${tweetId};`;
  const result = await database.all(checkTweetIdQuery);

  if (result[0] === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});
module.exports = app;
