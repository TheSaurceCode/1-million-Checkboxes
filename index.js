import http from "node:http";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";
import { publisher, subscriber } from "./redis-connection.js";
import { json } from "node:stream/consumers";

const CHECKBOX_SIZE = 100;
const state = {
  checkboxes: new Array(CHECKBOX_SIZE).fill(false),
};

async function main() {
  const app = express();
  const server = http.createServer(app);

  const io = new Server();
  io.attach(server);

  app.use(express.static(path.resolve("./public")));
  app.use(express.json());

  const PORT = process.env.PORT ?? 8000;
  server.listen(PORT, () => {
    console.log(`http Servre is running `);
  });

  app.get("/health", (req, res) => {
    res.json({
      message: " helath is running fine ...",
    });
  });

  app.get("/checkboxes", (req, res) => {
    res.json({
      checkboxes: state.checkboxes,
    });
  });


  await subscriber.subscribe("internal-server:checkbox:click");
  subscriber.on('message', (channel , data)=>{
    if (channel==="internal-server:checkbox:click") {
      const {index , checked}=JSON.parse(data);
      state.checkboxes[index]=checked;
      io.emit("server:checkbox:click",{index , checked});
    }
  })

  io.on("connection", (socket) => {
    console.log("this is the socket idd :-", socket.id);

    socket.on("user:checkbox:click", async (data) => {
      console.log(`[Socket:- ${socket.id}]: client:checkboc:click`, data);

      await publisher.publish(
        "internal-server:checkbox:click",
        JSON.stringify(data),
      );

      // io.emit("server:checkbox:click", data);
      // state.checkboxes[data.index]=data.checked
    });
  });
}

main().catch((error) => {
  console.log(error);
});
