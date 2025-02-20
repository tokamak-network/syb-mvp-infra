FROM golang:1.23-alpine

WORKDIR /app

ARG PORT
ARG SERVICE

ENV PORT=${PORT}
ENV SERVICE=${SERVICE}

RUN apk add --no-cache curl

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o main .

CMD ["./main"]