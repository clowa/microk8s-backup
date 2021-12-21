#! /bin/bash

usage="$(basename "$0") [-l |-s] -- program to build docker images of terraform for multiple platforms.

where:
    -l  only build docker image of latest GitHub release
    -s  build docker image with version tag of package.json"

# function joinByChar() {
#   local IFS="$1"
#   shift
#   echo "$*"
# }

# function invertArray() {
#   local array=("$@")
#   local tmpArray=()

#   ## get length of array
#   len=${#array[@]}
  
#   ## Use bash for loop 
#   for (( i=0; i<$len; i++ )); do
#     tmpArray[$len - $i]=${array[$i]}
#   done
#   echo "${tmpArray[@]}"
# }

if [[ -z ${DOCKER_IMAGE+set} ]]; then
  echo "Environment variable DOCKER_IMAGE not set. Run \"export DOCKER_IMAGE=containous/whoami\""
  exit 2
fi

if [[ -z ${PLATFORMS+set} ]]; then
  echo "Environment variable PLATFORMS not set. Run \"export PLATFORMS=linux/amd64,linux/arm64"
  exit 2
fi

while getopts :hls flag
do
    case "${flag}" in
        h)
          echo "$usage"
          exit
          ;;
        l)
          ## Set verion tag to latest
          VERSIONS=("latest")
          ;;
        s)
          ## Get package version from package.json
          VERSIONS=("latest" "v$(cat ./app/package.json | jq -r '.version')")
          ;;
    esac
done

for VERSION in "${VERSIONS[@]}"
do
    echo "Build Info:"
    echo "  VERSION: ${VERSION}"
    echo "  Platforms: ${PLATFORMS}"
    echo "  Tag: $DOCKER_IMAGE:${VERSION}"

    docker buildx build \
      --push \
      --file ./dockerfile \
      --platform ${PLATFORMS} \
      --tag $DOCKER_IMAGE:${VERSION} \
      .
done