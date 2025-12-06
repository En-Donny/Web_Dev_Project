run:
    docker-compose up

delete-all:
    docker-compose down --rmi all -v --remove-orphans

clean-local:
    docker-compose down --rmi local -v --remove-orphans