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

namespaces.on("connection", (socket) => {
  const namespace = socket.nsp;
  const peers = [];

  // Add in all the peers that are in the namespace
  for (let peer of namespace.sockets.keys()) {
    peers.push(peer);
  }

  // Send everyone on call to connecting peer
  socket.emit("connected peers", peers);

  // Send connecting peer's ID to everyone on the call
  socket.broadcast.emit("connected peer", socket.id);

  // listen for signals
  socket.on("signal", ({ to, from, signal }) => {
    socket.to(to).emit("signal", { to, from, signal });
  });
  // listen for disconnects
  socket.on("disconnect", () => {
    namespace.emit("disconnected peer", socket.id);
  });
});

module.exports = { app, io };
