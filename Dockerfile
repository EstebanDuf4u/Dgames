FROM nginx:alpine
COPY nginx.conf  /etc/nginx/conf.d/default.conf
COPY index.html  /usr/share/nginx/html/
COPY admin.html  /usr/share/nginx/html/
COPY profile.html /usr/share/nginx/html/
COPY css/        /usr/share/nginx/html/css/
COPY js/         /usr/share/nginx/html/js/
