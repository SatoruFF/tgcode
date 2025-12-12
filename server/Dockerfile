FROM golang:1.22-alpine

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o proxy main.go

EXPOSE 51837

CMD ["./proxy"]
