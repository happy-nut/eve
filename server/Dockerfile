FROM node:22-alpine
WORKDIR /app
COPY index.mjs .
ENV PORT=8787 JOT_DB=/data/jot.sqlite
VOLUME /data
EXPOSE 8787
CMD ["node", "index.mjs"]
