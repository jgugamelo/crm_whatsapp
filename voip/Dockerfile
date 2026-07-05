# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the Go application from cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o voip-server ./cmd/server

# Run stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app/

# Copy the pre-built binary from builder
COPY --from=builder /app/voip-server .

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./voip-server", "-addr", ":8080"]
