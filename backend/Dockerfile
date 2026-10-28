FROM node:22-alpine

WORKDIR /app

ENV TZ=Asia/Bangkok

# better-sqlite3 9.x has no prebuilt binary for Node 22 on Alpine, so it compiles from source
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

RUN mkdir -p data uploads

EXPOSE 3000

CMD ["node", "src/index.js"]
