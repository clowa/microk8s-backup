# This Dockerfile ...

ARG NODE_VERSION=3.18
ARG GO_VERSION=1.20

################################
## Build golang application
################################
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine as go-build

ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH
ARG GIT_BRANCH=master

# Set golang compiler arguments
ENV CGO_ENABLED=0
ENV GOOS=${TARGETOS}
ENV GOARCH=${TARGETARCH}

# Install git to clone repo
RUN apk add --quiet --no-cache --upgrade git

# What's going on here?
# - 

# Build binary
WORKDIR $GOPATH/src/github.com/canonical/
RUN git clone --branch ${GIT_BRANCH} https://github.com/canonical/go-migrator.git
WORKDIR $GOPATH/src/github.com/canonical/go-migrator
RUN go mod download
RUN go build -o $GOPATH/bin/migrator
WORKDIR $GOPATH/bin/
RUN cp migrator /bin/

################################
## Building node.js app
################################
FROM --platform=$BUILDPLATFORM node:lts-alpine${NODE_VERSION} as ts-build

# Create Directory for the Container
WORKDIR /app
# Copy files with dependencies and config to working directory
COPY [ "./app/package*.json", "./app/tsconfig.json", "./app/yarn.lock", "./" ]
# Install all Packages
RUN yarn install --silent --non-interactive --network-timeout 1000000
# Copy all other source code to work directory
COPY ./app/src ./src
# Transpile TypeScript
RUN yarn run build

################################
## Final image
################################
FROM node:lts-alpine${NODE_VERSION} as final
#LABEL maintainer="My Company Team <email@example.org>"
# Mount kine socket to container
VOLUME /kine.sock

# Update OS
RUN apk --quiet --update-cache upgrade

ENV NODE_ENV=production 
WORKDIR /app
COPY ./app/package.json .
RUN yarn install --production --silent --non-interactive --network-timeout 1000000
COPY --from=ts-build [ "/app/build", "./build" ]

# Switch to user node
RUN chown -R node:node .
USER node

# Copy only the files we need from the previous stage
COPY --from=go-build [ "/bin/migrator", "/bin/migrator" ]

ENTRYPOINT [ "node", "./build/app.js" ]