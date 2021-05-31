const axios = require("axios");

function extractPaths(url) {
  let paths = {};
  let isPath = false;
  let path = undefined;
  for (let i in url) {
    let letter = url[i];
    if (letter === "{") {
      isPath = true;
      path = "";
    } else if (letter === "}") {
      isPath = false;
      paths[path] = null;
    }

    if (isPath && letter !== "{" && letter !== "}") {
      path = path.concat(letter);
    }
  }
  return paths;
}

function injectPaths(urlTemplate, paths) {
  let url = urlTemplate;
  for (let path in paths) {
    url = url.replace(`{${path}}`, paths[path]);
  }
  return url;
}

function kvString(params) {
  let paramsString = "";
  for (let param in params) {
    paramsString += `${param}=${params[param]}&`;
  }
  return paramsString.slice(0, -1);
}

class Resource {
  constructor(url, instance) {
    if (instance) {
      this.__instance = instance;
    } else {
      this.__instance = axios.create();
    }
    this.__urlTemplate = url;
    this.__paths = extractPaths(this.__urlTemplate);

    this.__data = {};
    this.__params = {};
    this.__headers = {};
  }

  _doSet(target, key, value) {
    target[key] = value;
  }
  data(key, value) {
    this._doSet(this.__data, key, value);
  }
  path(key, value) {
    this._doSet(this.__paths, key, value);
  }
  param(key, value) {
    this._doSet(this.__params, key, value);
  }
  header(key, value) {
    this._doSet(this.__headers, key, value);
  }

  isValid() {
    for (let path in this.__paths) {
      if (this.__paths[path] === null) {
        return false;
      }
    }
    return true;
  }

  baseUrl() {
    if (this.isValid()) {
      return injectPaths(this.__urlTemplate, this.__paths);
    }
    return undefined;
  }

  fullUrl() {
    let url = undefined;

    if (this.isValid()) {
      url = injectPaths(this.__urlTemplate, this.__paths);
      let params = kvString(this.__params);
      if (params.length > 0) {
        url += `?${params}`;
      }
    }
    return url;
  }

  _request(method) {
    let requestDetails = {
      method: method,
      url: this.baseUrl(),
      params: this.__params,
      headers: this.__headers,
    };

    if (method === "POST" || method === "PUT" || method === "PATCH") {
      requestDetails.data = this.__data;
    }

    return this.__instance.request(requestDetails);
  }

  get() {
    return this._request("GET");
  }
  put() {
    return this._request("PUT");
  }
  post() {
    return this._request("POST");
  }
  patch() {
    return this._request("PATCH");
  }
}

module.exports = Resource;
