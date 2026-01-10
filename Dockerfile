#FROM node:22-alpine
FROM arm32v7/node:22-alpine

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

COPY . /opt/app-root/src
WORKDIR /opt/app-root/src

ENV NODE_ENV=production

CMD ["npm", "start"]