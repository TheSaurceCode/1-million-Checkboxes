1 Million Checkboxes
A real-time collaborative application where multiple users can interact
with a shared grid of one million checkboxes. When one user changes a
checkbox, other connected users should see that change without
refreshing the page.

This project is a practical way to learn WebSockets, Redis, stateful
and stateless servers, real-time event broadcasting, and horizontal
scaling.
Learning goal: understand not only how to make the checkboxes work,
but why the backend is designed this way and what changes when more
than one server instance is running.

Table of contents
- What are we building?
- Core concepts
- 1. Stateful vs stateless servers
- 2. WebSockets
- 3. Redis
- 4. Why Redis PubSub is needed
- 5. End-to-end checkbox flow
- 6. Architecture
- 7. Run and explore the project
- 8. Experiments to understand the
  system
- 9. Important questions to be able to
  answer
- 10. Further reading
What are we building?
Imagine a website with 1,000,000 checkboxes. Thousands of users may open
the website at the same time. If one user checks checkbox number 250,
the other users should receive that update almost immediately.

The application has three important responsibilities:
1. Receive changes: accept a user's checkbox action.
2. Store the truth: save the latest checkbox state somewhere
   reliable and shared.
3. Distribute changes: notify other connected users about the
   update.
These responsibilities introduce the main technologies used in this
project:

  Technology                 Responsibility
  Node.js + Express          HTTP server and API routes
WebSockets / Socket.IO     Real-time, two-way communication
Redis                      Fast shared data storage
Redis Pub/Sub              Deliver updates between server instances
Docker Compose             Run Redis locally in a repeatable environment
HTML, CSS and JavaScript   Render the checkbox interface

The exact implementation may use the ws WebSocket library or
Socket.IO. They are related but not identical: Socket.IO adds features
such as event names, reconnection support and rooms; it is not simply
the WebSocket protocol itself.
Core concepts
Before exploring the code, keep these distinctions clear:
- A WebSocket connection is a communication channel between a
  browser and a server.
- Application state is the data that describes the current
  checkbox values.
- Server memory is local to a particular server process.
- Redis can act as a shared state store that multiple server
  processes can access.
- Pub/Sub distributes messages to subscribers; it is not, by
  itself, durable storage.
A useful design principle:
Keep the authoritative shared application state outside an individual
server process when multiple server instances must work together.

1. Stateful vs stateless servers
Stateful server
A stateful server keeps some application state in its own memory.

For example:
const checkboxes = new Map();

checkboxes.set(101, true);
The server remembers that checkbox 101 is checked.

Problem: this memory belongs only to that running Node.js process.
If the process restarts, the data disappears unless it was saved
elsewhere. If another server instance receives a request, it does not
automatically know about this Map.
Stateless server
A stateless server does not depend on its own local memory to remember
shared application data between requests. It reads and writes that data
through an external system, such as Redis or a database.
// Conceptual example
await redis.set("checkbox:101", "1");

const value = await redis.get("checkbox:101");
Any server instance using the same Redis deployment can access the
shared value.
Comparison
  Stateful approach                   Stateless approach
  Stores application state in process Uses external shared storage
memory                              

  Different instances can have        Instances can read the same shared
different copies                    data

  Restart can lose in-memory state    State can survive restarts if Redis
persistence is configured

  Scaling requires synchronization    Easier to scale horizontally
Useful for local, temporary data    Useful for shared application data
Important nuance: stateless does not mean a server has absolutely no
memory. A WebSocket server necessarily maintains connection-related
information while clients are connected. The goal is to avoid making
shared, durable application correctness depend on one server's local
memory.
Try this experiment
1. Store a checkbox value in a JavaScript Map.
2. Restart the server.
3. Check whether the value still exists.
4. Store the same value in Redis.
5. Restart the server again.
6. Read the value from Redis.
Ask yourself: which storage location survived the restart, and why?
2. WebSockets
What are WebSockets?
HTTP normally follows a request-response pattern: the client sends a
request, and the server sends a response.

WebSockets provide a persistent, two-way communication channel. Once the
connection is established, either side can send messages without
starting a new HTTP request for every update.

This is useful for:
- Chat applications
- Live notifications
- Collaborative editors
- Multiplayer games
- Real-time dashboards
- Shared checkbox applications
HTTP vs WebSocket
  HTTP                                WebSocket
  Usually request-response            Two-way communication

  New request for each operation      Persistent connection

  Server generally responds to a      Server can send updates
request                             independently
Suitable for ordinary APIs          Suitable for real-time events
Basic connection lifecycle
Browser                 Server
   |                       |
   |------ Connect ------->|
   |                       |
   |<----- Connected ------|
   |                       |
   |---- Toggle event ---->|
   |                       |
   |<--- Update event -----|
   |                       |
   |------ Disconnect ---->|
Example using Socket.IO
Server:
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("checkbox:toggle", async ({ id, checked }) => {
    // Validate the payload.
    // Save the new value in Redis.
    // Broadcast the accepted update.
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});
Client:
const socket = io("http://localhost:8000");

socket.emit("checkbox:toggle", {
  id: 101,
  checked: true,
});

socket.on("checkbox:update", (data) => {
  console.log("Checkbox updated:", data);
});
This is an illustrative Socket.IO example. Match the event names and
payloads to your actual implementation.
What you should understand
- Connection
- Disconnection
- Event listeners
- Event emitters
- Broadcasting
- Client-to-server communication
- Server-to-client communication
- Reconnection
- Validation and error handling
3. Redis
What is Redis?
Redis is an in-memory data store that supports data structures such as
strings, hashes, lists, sets, sorted sets and bitmaps.

In this project, Redis can be used for:
1. Storing checkbox states.
2. Sharing state between multiple backend instances.
3. Publishing checkbox updates to other server instances.
4. Implementing rate limiting.
Why not use a JavaScript array?
A simple implementation might look like this:
const checkboxes = new Array(1_000_000).fill(false);
This is useful for learning, but it has limitations:
- The state exists only in that Node.js process.
- Other server instances cannot automatically access it.
- Restarting the process loses the state.
- A large in-memory data structure consumes application memory.
Redis bitmap
A bitmap stores values as individual bits.

For this project:
- 0 means unchecked.
- 1 means checked.
- The checkbox index identifies the bit position.
Example Redis commands:
SETBIT checkboxes:bits 101 1
GETBIT checkboxes:bits 101
BITCOUNT checkboxes:bits
The first command checks checkbox 101, the second reads its state, and
the third counts all set bits.
How much space does one million bits require?
One checkbox needs one bit.
1,000,000 bits / 8 = 125,000 bytes
That is approximately 122.1 KiB of raw bit data, excluding Redis key and
internal overhead.

This is much more compact than storing one Redis key per checkbox.
Why Redis is useful here
Redis gives multiple Node.js processes access to the same checkbox
state. If server A updates a checkbox, server B can read the updated
value from Redis.

Remember: Redis is not automatically durable just because it is
Redis. Persistence depends on its configuration, such as RDB snapshots
or AOF.
4. Why Redis Pub/Sub is needed
Imagine you have two backend servers:
                 Redis
                /     \
               /       \
          Server A    Server B
             |           |
          Client 1    Client 2
Client 1 is connected to Server A. Client 2 is connected to Server B.

Client 1 checks a checkbox.

Server A updates Redis. But how does Server B learn that a change
happened so it can notify Client 2?

This is where Redis Pub/Sub helps.
Publisher and subscriber
- Publisher: sends a message to a Redis channel.
- Subscriber: listens to a Redis channel and receives messages.
Example:
// Publisher
await publisher.publish(
  "checkbox:updates",
  JSON.stringify({
    id: 101,
    checked: true,
  })
);
Subscriber:
await subscriber.subscribe("checkbox:updates", (message) => {
  const update = JSON.parse(message);

  // Broadcast to WebSocket clients connected to this server.
});
Each server instance subscribes to the same channel.
Multi-server update flow
Client 1
   |
   v
Server A
   |
   | Update checkbox state
   v
Redis Bitmap
   |
   | Publish update
   v
Redis Pub/Sub Channel
   |
   +----------------------+
   |                      |
   v                      v
Server A                Server B
   |                      |
   v                      v
Client 1                Client 2
Now clients connected to different servers can receive the same update.
Important distinction
Redis Pub/Sub is a message delivery mechanism, not the source of truth.

Redis Pub/Sub messages are not stored for disconnected subscribers to
replay later. If a subscriber is offline when a message is published, it
misses that message.

That is why the application should:
1. Save the authoritative state in Redis.
2. Publish the update.
3. Let connected servers broadcast the event.
4. Let clients fetch or resynchronize state after reconnecting.
For durable event history or replay, investigate Redis Streams or
another durable messaging system.
5. End-to-end checkbox flow
Here is the complete conceptual flow when a user checks checkbox 101.
1. User clicks checkbox 101
          |
          v
2. Browser sends a WebSocket event
          |
          v
3. Node.js server receives the event
          |
          v
4. Server validates the checkbox ID and user permissions
          |
          v
5. Server checks the rate limit
          |
          v
6. Server updates checkbox state in Redis
          |
          v
7. Server publishes an update through Redis Pub/Sub
          |
          v
8. All subscribed server instances receive the message
          |
          v
9. Each server broadcasts to its connected clients
          |
          v
10. Browsers update the relevant checkbox
The database update should happen before announcing success. Otherwise,
clients might display a change that was never saved.

For robust implementations, also consider duplicate events, simultaneous
updates, reconnection and how clients recover missed updates.
6. Architecture
A simplified architecture for the project:
              BROWSER CLIENTS
          +---------------------+
          | Checkbox UI         |
          | WebSocket Client    |
          +----------+----------+
                     |
                     | WebSocket / HTTP
                     |
          +----------v----------+
          | Node.js + Express   |
          |                     |
          | API Routes          |
          | WebSocket Handler   |
          | Redis Service       |
          +----------+----------+
                     |
                     |
          +----------v----------+
          |       REDIS         |
          |                     |
          | Checkbox Bitmap     |
          | Pub/Sub Channel     |
          | Rate Limit Data     |
          +---------------------+
When scaling horizontally, run multiple Node.js instances behind a load
balancer. Each instance connects to Redis and subscribes to the update
channel.

WebSocket scaling note: if using Socket.IO across multiple
instances, configure a compatible adapter such as the Redis adapter.
Depending on the transport and deployment, sticky sessions may also be
required. Plain WebSocket deployments have their own connection-routing
considerations.
7. Run and explore the project
Use the commands that match your own package.json scripts.
Start Redis with Docker Compose
docker compose up -d
Check running containers:
docker compose ps
View Redis logs:
docker compose logs redis
The service name may differ in your docker-compose.yml.
Install dependencies
pnpm install
Start the application
pnpm dev
Inspect Redis
If Redis CLI is available inside the container:
docker compose exec redis redis-cli
Try:
PING
Then inspect your project's actual Redis keys and commands.
KEYS *
Use SCAN rather than KEYS * when inspecting a large or production
Redis instance.
8. Experiments to understand the system
Do these in order. Each experiment should teach you one specific
concept.
Experiment 1 --- Understand stateful servers
- [ ] Store checkbox values in a JavaScript array or Map.
- [ ] Start the server.
- [ ] Change a checkbox.
- [ ] Restart the server.
- [ ] Observe what happens to the data.
Learning: process memory is temporary and local to that server
instance.
Experiment 2 --- Understand WebSockets
- [ ] Open the application in two browser tabs.
- [ ] Connect both tabs to the server.
- [ ] Emit a checkbox event from tab one.
- [ ] Broadcast the event from the server.
- [ ] Observe tab two.
Learning: real-time two-way communication.
Experiment 3 --- Understand Redis storage
- [ ] Connect your Node.js application to Redis.
- [ ] Store one checkbox state.
- [ ] Read the same checkbox state.
- [ ] Restart Node.js.
- [ ] Read the value again.
Learning: shared external state and persistence configuration.
Experiment 4 --- Understand stateless application servers
- [ ] Start two Node.js server instances on different ports.
- [ ] Connect one browser to each instance.
- [ ] Store checkbox data in Redis.
- [ ] Update the checkbox through Server A.
- [ ] Read the value through Server B.
Learning: multiple instances can access the same authoritative
state.
Experiment 5 --- Understand Redis Pub/Sub
- [ ] Connect both server instances to Redis.
- [ ] Subscribe both to the same update channel.
- [ ] Publish a checkbox update from Server A.
- [ ] Observe whether Server B receives it.
- [ ] Broadcast the update to Server B's connected browser.
Learning: communication between independent server instances.
Experiment 6 --- Understand rate limiting
- [ ] Send repeated checkbox events.
- [ ] Implement a per-user or per-client limit.
- [ ] Store the counters in Redis.
- [ ] Send requests through both server instances.
- [ ] Verify that the limit is shared.
Learning: distributed rate limiting.
Experiment 7 --- Test failure and recovery
- [ ] Disconnect a browser.
- [ ] Change a checkbox from another browser.
- [ ] Reconnect the disconnected browser.
- [ ] Fetch the latest state from Redis.
- [ ] Verify that the browser catches up.
Learning: Pub/Sub does not replay missed messages, so clients need a
resynchronization strategy.
9. Important questions to be able to answer
Before considering this project complete, make sure you can explain
these in your own words.
WebSockets
1. What is the difference between HTTP and WebSockets?
2. Why does a WebSocket connection remain open?
3. What happens when a client disconnects?
4. What is the difference between sending an event to one client and
   broadcasting to all clients?
Stateful and stateless servers
5. Why is a JavaScript Map inside a server process considered local
   state?
6. Why can two Node.js instances have different in-memory data?
7. How does Redis help multiple instances share application state?
8. Does a stateless application server mean it has no memory at all?
Redis
9. What is Redis?
10. What is a bitmap?
11. Why use a bitmap instead of one million individual Redis keys?
12. What do SETBIT, GETBIT and BITCOUNT do?
13. What is the difference between Redis storage and Redis Pub/Sub?
Distributed systems
14. Why does Server B need to know about an update made by Server A?
15. How does Redis Pub/Sub help?
16. What happens if a subscriber is disconnected when a message is
    published?
17. How would you synchronize a client after reconnection?
18. Why should rate limiting be shared across server instances?
If you can explain these questions and demonstrate the experiments, you
have learned much more than simply building a checkbox UI.
10. Further reading
Use these resources to deepen your understanding:
- MDN --- WebSocket
  API
- Redis --- Introduction
- Redis --- Bitmap
  commands
- Redis --- Pub/Sub
- Socket.IO --- Documentation
- Docker Compose --- Documentation
Final takeaway
The most important lesson from this project is the separation of
responsibilities:
- WebSockets keep clients connected for real-time communication.
- Redis stores shared checkbox state.
- Redis Pub/Sub communicates updates between backend instances.
- Stateless application design allows multiple server instances to
  work with the same shared state.
- Docker makes the supporting infrastructure easier to run
  locally.
Don't just copy the implementation. Run the experiments, inspect Redis,
start two servers, disconnect clients, and observe what happens.

That is how you turn this project into a practical lesson in backend
engineering and distributed systems.
