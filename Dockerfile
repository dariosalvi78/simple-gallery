FROM node:24.12-alpine

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

COPY . /opt/app-root/src
WORKDIR /opt/app-root/src

ENV NODE_ENV=production

CMD ["npm", "start"]