# 1. Use the highly optimized Debian-based Node image
FROM node:20-bookworm-slim

# 2. Set the working directory inside the container
WORKDIR /usr/src/app

# 3. Install build tools just long enough to compile SQLite
RUN apt-get update && \
    apt-get install -y python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# 4. Copy only the package files first to leverage Docker layer caching
COPY package*.json ./

# 5. Install dependencies (this will now compile perfectly)
RUN npm install

# 6. Optional but recommended: Remove the heavy build tools now that compilation is done
RUN apt-get purge -y python3 build-essential && \
    apt-get autoremove -y

# 7. Copy your bot code and web dashboard files
COPY . .

# 8. Ensure the data directory exists so TrueNAS has a target to mount to
RUN mkdir -p data

# 9. Expose port 3000 for your web dashboard
EXPOSE 3000

# 10. Fire it up
CMD ["node", "scripts/index.js"]
