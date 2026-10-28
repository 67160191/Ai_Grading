FROM node:22-alpine

WORKDIR /app

ENV TZ=Asia/Bangkok

# better-sqlite3 9.x has no prebuilt binary for Node 22 on Alpine, so it compiles from source
# openjdk21-jdk provides javac and java for code execution sandbox
RUN apk add --no-cache python3 make g++ openjdk21-jdk

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

RUN mkdir -p data uploads

EXPOSE 3000

CMD ["node", "src/index.js"]
