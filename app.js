const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const io = require("socket.io")();

//Add conts variable for Spotify router
const spotifyRouter = require("./routes/spotify.router");

const app = express();

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html", "htm"],
  })
);

app.use("/spotify", spotifyRouter);
//app.use('/', indexRouter);
//app.use('/users', usersRouter);

const namespaces = io.of(/^\/[a-z]{3}\-[a-z]{4}\-[a-z]{3}$/);

namespaces.on("connection", function (socket) {
  const namespace = socket.nsp;
  const peers = [];

  for (let peer of namespace.sockets.keys()) {
    peers.push(peer);
  }

  // Send array of all peer IDs to new connector
  socket.emit("connected peers", peers);

  // Send new connector peer ID to all connected peers
  socket.broadcast.emit("connected peer", socket.id);

  // listen for and route signals
  socket.on("signal", function ({ to, from, signal }) {
    socket.to(to).emit("signal", { to, from, signal });
  });

  // listen for disconnects
  socket.on("disconnect", function () {
    namespace.emit("disconnected peer", socket.id);
  });
});

module.exports = { app };
