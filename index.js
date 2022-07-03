const axios = require("axios").default;
const Redis = require("redis");
const {
  v4
} = require("uuid");
const uuidv4 = v4;

module.exports = class DatabaseManager { // Static property
  dbName = "undefined";
  dbs = {
    // Example format:
    // [url]: {
    //   dbServiceName: "couchdb"
    // },
  };
  redisClient = "";
  uniqueIdentifierKeys = [];

  constructor(uniqueIdentifierKeys) {
    if (uniqueIdentifierKeys &&
      uniqueIdentifierKeys.constructor === Array) {
      // The given var has a corrrect format
      this.uniqueIdentifierKeys = uniqueIdentifierKeys;
    } else {
      throw new Error(`We need unique identifier key name for redis`);
    }
  }

  /** Connect to a database, it can be one of the following:
   * * Couchdb
   * * Redis
   * * PostgreSQL
   * 
   * @param {string} url 
   * @param {object} options 
   * @param {function} callback 
   * @returns 
   */
  async connect(url, options = {}, callback = () => {}) {
    if (typeof (url) === "string") {
      // Check if the url isn't already in
      for (const db in this.dbs) {
        if (url == db) {
          return
        }
      }

      // Connect to redis
      if (url.startsWith("redis://")) {
        this.redisClient = Redis.createClient({
          url
        });
        this.redisClient.on("error", (err) => {
          throw Error(err);
        });

        await this.redisClient.connect();

        // Insert the db url
        this.dbs = {
          ...this.dbs,
          [url]: {
            dbServiceName: "redis"
          },
        };

        return callback();
      } else {
        // Check if the url exists
        await axios.get(url).then((res) => {

          // Get data
          const data = res.data;
          let dbServiceName = ""

          // It's couchdb?
          if ("couchdb" in data) {
            // The database is couchdb
            // Do stuff...
            dbServiceName = "couchdb"

            // Create a db
            axios
              .put(`${url}/${this.dbName}`)
              .then((res) => {
                // console.log(`Database created!`)
              })
              .catch((err) => {
                // Probably it already exists
              });
          }

          // Insert the db url
          this.dbs = {
            ...this.dbs,
            [url]: {
              dbServiceName,
            },
          };

          return callback();
        }).catch((err) => {
          throw Error(err);
        });
      }
    }
  }

  /**Tries to parse data
   * 
   * @param {*} data 
   * @returns 
   */
  #stringify(data) {
    if (typeof (data) == "object") {
      return JSON.stringify(data);
    }
    return data;
  }

  /**
   * 
   * @param {*} unparsedData 
   * @param {*} options 
   * @param {*} callback 
   * @returns 
   */
  async set(normalData, options = {}, callback = () => {}) {
    normalData["_id"] = uuidv4();
    const data = this.#stringify(normalData);
    const output = {};

    for (let url of Object.keys(this.dbs)) {
      let dbServiceName = this.dbs[url]["dbServiceName"];
      console.log(dbServiceName)

      if (dbServiceName == "couchdb") {
        output[dbServiceName] = await axios.post(`${url}/${this.dbName}`, {
          // In case it's possible to use multiple values for
          // the same thing(like email), replace the original
          // to point to the new value, and convert this as the
          // original
          //_pointsTo: "asdf@gmail.com",
          ...normalData,
        });
      } else if (dbServiceName == "redis") {
        const redisKeyword = this.#getQueryString(normalData);
        console.log(`Rediskeyword: `, redisKeyword["redis"]);
        console.log(`Its typeof: `, typeof (redisKeyword["redis"]));
        console.log(`UUIDV4 type: `, typeof (uuidv4()));
        console.log(`Data type: `, typeof (data));

        // Unsupported Redis Commands
        // If you want to run commands and / or use
        // arguments that Node Redis doesn 't know
        // about(yet!) use.sendCommand():
        // await client.sendCommand(['SET', 'key', 'value', 'NX']);
        // 'OK'
        output[dbServiceName] =
          await this.redisClient.sendCommand(["SET", redisKeyword, data]);
      }
    }

    return callback({
      output
    });
  }

  /**Transform into a query string for the databases
   * TODO:
   * () If the unique identifiers is a bool with 
   * false value or is undefined, it will throw
   * an error, make it so that this doesn't
   * happen.
   * 
   * @param {*} queryObject 
   * @returns 
   */
  #getQueryString(queryObject) {
    const couchdbQuery = {
      "selector": {},
    };
    let redisQuery = this.dbName;

    // Get every unique identifier key name
    for (let key of this.uniqueIdentifierKeys) {
      // Check if the value exists and is not undefined
      if (queryObject[key]) {
        // For couchdb
        couchdbQuery["selector"][key] = {
          "$eq": queryObject[key],
        };

        // For redis
        redisQuery += `:${queryObject[key]}`;
      } else {
        throw Error("Unique key identifiers not given or is undefined.");
      }
    }

    return {
      "couchdb": this.#stringify(couchdbQuery),
      "redis": redisQuery,
    };
  }

  async get(queryObject, options = {}, callback = () => {}) {
    const output = {};

    for (let url of Object.keys(this.dbs)) {
      let dbServiceName = this.dbs[url]["dbServiceName"];
      let query = this.#stringify(queryObject);

      if (dbServiceName == "couchdb") {
        output[dbServiceName] = await axios.post(
            `${url}/${this.dbName}/_find`, queryObject)
          .then((res) => {
            console.log(res);
          });
      } else if (dbServiceName == "redis") {
        output[dbServiceName] = await this.redisClient.get(
          query
        );
      }
    }

    return callback({
      output,
    });
  }

  /**Get a list(object) of the connected databases
   * 
   * @returns 
   */
  getDatabaseList() {
    return this.dbs;
  }
}