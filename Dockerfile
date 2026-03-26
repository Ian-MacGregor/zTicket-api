# Use the official Node.js 20 slim image as the base (slim reduces image size by omitting extras)
FROM node:20-slim

# Set the working directory inside the container; all subsequent commands run here
WORKDIR /app

# Copy package.json and package-lock.json before other files to leverage Docker layer caching
COPY package*.json ./
# Install production and development dependencies
RUN npm install

# Copy the TypeScript compiler config
COPY tsconfig.json ./
# Copy all TypeScript source files into the container
COPY src ./src

# Compile TypeScript to JavaScript (output goes to the dist/ directory per tsconfig.json)
RUN npx tsc

# Document that the app listens on port 3000 (informational; does not publish the port)
EXPOSE 3000
# Start the compiled app when the container runs
CMD ["node", "dist/index.js"]
