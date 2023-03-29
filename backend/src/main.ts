
import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch";
import { randomBytes } from "crypto";
import express from "express";
import expressWs from "express-ws";

const ews = expressWs(express());
const wss = ews.getWss();
const app = ews.app;
const port = process.env.PORT || 8888;

const baseUrl = `${process.env.ENDPOINT}`;
const auth = Buffer.from(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET).toString("base64");

let access_token: string;
let refresh_token: string;
let playerState: any;
let debugResponse: any;

wss.on("connection", (ws) => {
  let response;
  if (playerState === undefined) {
    response = JSON.stringify({
      status: 500,
      name: "Something is wrong with the server. What possibly happened is I forgot to login.",
      artists: ["Pream Pinbut"]
    });
  } else {
    response = JSON.stringify(playerState);
  }
  ws.send(response);
})

app.get("/api/login", (req, res) => {
  var client_id = process.env.CLIENT_ID;
  var redirect_uri = `${baseUrl}/api/callback`;

  var state = randomBytes(16).toString("hex");
  var scope = 'user-read-playback-state';

  res.redirect('https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: client_id as string,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }).toString()
  );
});

app.get("/api/callback", (req, res) => {
  var code = req.query.code || undefined;
  var state = req.query.state || undefined;

  if (state === undefined) {
    res.redirect('/#' +
      JSON.stringify({
        error: 'state_mismatch'
      }));
  } else {
    getAccessToken(code as string);
    res.json({ status: 200 });
  }
});

app.ws("/api/websocket", (ws, req) => {
  ws.on("message", (data) => {
    let command = data.toString().split(" ")[0];
    if (command === ":ping") {
      ws.send(":pong ปิงหาพ่อมึงอะไอ้สัส");
    }
  });
});

app.get("/api/get", async (req, res) => {
  let response;
  if (playerState === undefined) {
    response = JSON.stringify({
      status: 500,
      name: "Something is wrong with the server. What possibly happened is I forgot to login.",
      artists: ["Pream Pinbut"]
    });
  } else {
    response = playerState;
  }
  res.json(response);
});

app.get("/api/refresh", (req, res) => {
  refreshAccessToken();
  res.json({ status: 200 });
});

app.get("/api/debug/response", (req, res) => {
  res.json(debugResponse);
})

app.listen(port);

function getAccessToken(code: string) {
  let headersList = {
    "Authorization": "Basic " + auth,
    "Content-Type": "application/x-www-form-urlencoded"
  }

  let bodyContent = "code=" + code;
  bodyContent += "&redirect_uri=" + `${baseUrl}/api/callback`;
  bodyContent += "&grant_type=authorization_code";

  fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    body: bodyContent,
    headers: headersList
  })
    .then((response) => {
      return response.json();
    })
    .then((data: any) => {
      access_token = data.access_token;
      refresh_token = data.refresh_token;
    });
};

async function getPlayingState(): Promise<{}> {
  let headersList = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": "Bearer " + access_token
  }

  return await fetch("https://api.spotify.com/v1/me/player", {
    method: "GET",
    headers: headersList
  })
    .then(async (response) => {
      if (response.status === 204) {
        return { is_playing: false };
      }
      return { status: response.status, ...await response.json() };
    })
    .then(async (data: any) => {
      debugResponse = data;
      if (data.is_playing === false) {
        return { status: 400, name: "Currently Does Not Playing Any Track", artists: ["Pream Pinbut"] };
      }

      let artists = await Promise.all( data.item.artists.map(async (item: any) => {

        let headersList = {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": "Bearer " + access_token
        }

        return await fetch(`https://api.spotify.com/v1/artists/${item.id}`,
          {
            method: "GET",
            headers: headersList
          })
          .then((response) => response.json())
          .then((response) => {
            return {
              name: response.name,
              image: response.images[2].url
            };
          });
      }));

      const response = {
        status: 200,
        name: data.item.name,
        image: data.item.album.images[2].url,
        artists: artists
      };
      return response;
    })
    .catch(async (e) => {
      console.log(e);
      return {
        status: 500,
        name: "Something is wrong with the server. What possibly happened is I forgot to login.",
        artists: ["Pream Pinbut"]
      };
    });
};

async function refreshAccessToken() {
  let headersList = {
    "Authorization": "Basic " + auth,
    "Content-Type": "application/x-www-form-urlencoded"
  }

  let bodyContent = "grant_type=refresh_token";
  bodyContent += "&refresh_token=" + refresh_token;

  await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    body: bodyContent,
    headers: headersList
  })
    .then((response) => {
      return response.json();
    })
    .then((data: any) => {
      access_token = data.access_token;
    })
};

async function setPlayerState() {
  let newPlayerState: any = await getPlayingState();

  if (playerState === undefined) {
    playerState = newPlayerState;

    wss.clients.forEach((client) => {
      client.send(JSON.stringify(playerState));
    });

    return;
  }

  if (playerState.name === newPlayerState.name) {
    return;
  }

  playerState = newPlayerState;

  wss.clients.forEach((client) => {
    client.send(JSON.stringify(playerState));
  })
};

setInterval(setPlayerState, 1000 * 1);

setInterval(refreshAccessToken, 1000 * 60 * 30);