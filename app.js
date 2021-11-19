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

  socket.broadcast.emit("connected peer");

  // listen for signals
  socket.on("signal", (signal) => {
    socket.broadcast.emit("signal", signal);
  });
  // listen for disconnects
  socket.on("disconnect", () => {
    namespace.emit("disconnected peer");
  });
});

module.exports = { app, io };
