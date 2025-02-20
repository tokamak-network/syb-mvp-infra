package main

import (
	"fmt"
	"net/http"
	"os"
)

func healthHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "OK")
}

func main() {
	port := os.Getenv("PORT")
	service := os.Getenv("SERVICE")
	if port == "" || service == "" {
		fmt.Println("PORT and SERVICE environment variables must be set")
		os.Exit(1)
	}
	fmt.Printf("Starting %s on port %s\n", service, port)

	http.HandleFunc("/health", healthHandler)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), nil); err != nil {
		fmt.Println("Error starting server: ", err)
	}
}