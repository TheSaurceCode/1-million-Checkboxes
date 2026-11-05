import Redis from "ioredis";

function createRedisConnection() {
  return new Redis({
    host: "localhost",
    port: 6379,
  });
}

const redis = createRedisConnection();

const publisher = createRedisConnection();

const subscriber = createRedisConnection();

export { publisher, subscriber };
