FROM node:16-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
# Copy package-lock.json if available (optional)
COPY package-lock.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Set environment variable to run on port 80
ENV PORT=80
EXPOSE 80

CMD ["npm", "start"]
