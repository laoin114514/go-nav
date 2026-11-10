#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

ENV_IMAGE_NAME="${IMAGE_NAME-}"
ENV_IMAGE_TAG="${IMAGE_TAG-}"
ENV_PLATFORMS="${PLATFORMS-}"
ENV_PUSH_LATEST="${PUSH_LATEST-}"
ENV_IMAGE_NAME_SET="${IMAGE_NAME+x}"
ENV_IMAGE_TAG_SET="${IMAGE_TAG+x}"
ENV_PLATFORMS_SET="${PLATFORMS+x}"
ENV_PUSH_LATEST_SET="${PUSH_LATEST+x}"

if [ -f .env ]; then
	set -a
	. ./.env
	set +a
fi

if [ -n "$ENV_IMAGE_NAME_SET" ]; then
	IMAGE_NAME="$ENV_IMAGE_NAME"
fi

if [ -n "$ENV_IMAGE_TAG_SET" ]; then
	IMAGE_TAG="$ENV_IMAGE_TAG"
fi

if [ -n "$ENV_PLATFORMS_SET" ]; then
	PLATFORMS="$ENV_PLATFORMS"
fi

if [ -n "$ENV_PUSH_LATEST_SET" ]; then
	PUSH_LATEST="$ENV_PUSH_LATEST"
fi

PACKAGE_VERSION="${npm_package_version:-$(node -p "require('./package.json').version")}"
DEFAULT_IMAGE_NAME="go-nav"

IMAGE_NAME="${IMAGE_NAME:-$DEFAULT_IMAGE_NAME}"
IMAGE_TAG="${IMAGE_TAG:-$PACKAGE_VERSION}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH_LATEST="${PUSH_LATEST:-true}"

TAGS="-t ${IMAGE_NAME}:${IMAGE_TAG}"

if [ "$PUSH_LATEST" = "true" ] && [ "$IMAGE_TAG" != "latest" ]; then
	TAGS="$TAGS -t ${IMAGE_NAME}:latest"
fi

echo "Pushing ${IMAGE_NAME}:${IMAGE_TAG}"
if [ "$PUSH_LATEST" = "true" ] && [ "$IMAGE_TAG" != "latest" ]; then
	echo "Also tagging ${IMAGE_NAME}:latest"
fi
echo "Platforms: ${PLATFORMS}"

docker buildx build \
	--platform "$PLATFORMS" \
	$TAGS \
	--push \
	.
