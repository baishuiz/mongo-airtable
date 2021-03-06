import path from 'path'
import { MongoClient } from 'mongodb'
import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config()

const { readFile } = fs.promises

const url = `${process.env.MONGO_URL}/${process.env.MONGO_DB}`

export async function putIntoDB({ primary, collection, database }) {
  const client = new MongoClient(url, { useUnifiedTopology: true })
  const connection = await client.connect()
  const db = connection.db(database)
  collection = db.collection(collection)

  const filename = path.resolve(`${__dirname}/../build/${database}/${primary}.json`)

  let data = await readFile(filename)
  data = JSON.parse(data)

  await collection.removeMany({})

  if(data.length > 0) await collection.insertMany(data)

  await connection.close()
}


export async function initialInsert(config) {
  for (const { primary, collection, database } of config.sync) {
    await putIntoDB({
      primary,
      collection,
      database
    })
  }
}

