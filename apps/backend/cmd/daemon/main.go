// This example demonstrates how to authenticate with Spotify using the authorization code flow with PKCE.
// In order to run this example yourself, you'll need to:
//
//  1. Register an application at: https://developer.spotify.com/my-applications/
//     - Use "http://localhost:8080/callback" as the redirect URI
//  2. Set the SPOTIFY_ID environment variable to the client ID you got in step 1.
package main

import (
	"backend/app"
	"backend/config"
	"fmt"
	"net"

	"github.com/sirupsen/logrus"
	spotifyauth "github.com/zmb3/spotify/v2/auth"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		logrus.WithError(err).Fatalf("failed to load config")
	}

	auth := app.NewAuth(spotifyauth.WithClientID(cfg.ClientId), spotifyauth.WithRedirectURL(config.RedirectURI), spotifyauth.WithScopes(spotifyauth.ScopeUserReadPrivate, spotifyauth.ScopeUserReadPlaybackState))
	session := app.NewSession(cfg, auth)
	server := app.NewServer(session)

	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.Port))
	if err != nil {
		logrus.WithError(err).Fatalf("failed to create listener")
	}

	done := make(chan int)
	server.StartOAuth2Server(listener, session, done)
	url := app.AuthURL(session)
	logrus.Infof("%s", url)

	<-done

	if err = server.StartServer(listener); err != nil {
		logrus.WithError(err).Fatalf("failed to start server")
	}
}
