IMAGE_NAME = tg-proxy
PORT = 51837

build:
	docker build -t $(IMAGE_NAME) .

run:
	docker run -it --rm -p $(PORT):$(PORT) $(IMAGE_NAME)

rebuild: build run

clean:
	docker rm -f $(shell docker ps -aq --filter "ancestor=$(IMAGE_NAME)") || true

logs:
	docker logs -f $(shell docker ps -q --filter "ancestor=$(IMAGE_NAME)")
