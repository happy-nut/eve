FROM node:22-alpine
WORKDIR /app
COPY index.mjs .
ENV PORT=8787 EVE_DB=/data/eve.sqlite
VOLUME /data
EXPOSE 8787
CMD ["node", "index.mjs"]
