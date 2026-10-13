FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . ./
RUN mkdir -p temp_upload && chown node:node temp_upload

USER node
EXPOSE 10000
CMD ["npm", "start"]
