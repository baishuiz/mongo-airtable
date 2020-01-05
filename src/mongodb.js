import path from 'path'
import mongodb from 'mongodb'
import nconf from 'nconf'
import nconfYAML from 'nconf-yaml'
import deepEqual from 'deep-equal'
import _ from 'lodash'

import { each } from 'lodash'

import util from 'util'
import fs from 'fs'
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)

const config = nconf.env({ separator: `__`, match: new RegExp(`^config.*`) })
  .file({ file: path.resolve(`${__dirname}/../config.yaml`), format: nconfYAML })
  .get()
  .config

const mongo_client = mongodb.MongoClient

const build = path.resolve(`${__dirname}/../build/`)

export async function initialInsert() {
  // you can pass in --filter Fragments to just update that
  const filter = `Colors`

  let sync = config.sync

  if (filter) {
    sync = _.filter(sync, (table) => {
      return table.airtable_table === filter
    })
  }

  for (const table_to_sync of sync) {
    const db = await mongo_client.connect(`mongodb://localhost:27017/${table_to_sync.mongo_database}`)
    const filename = path.resolve(`${__dirname}/build/${table_to_sync.airtable_table}.json`)

    let data = await readFile(filename)
    data = JSON.parse(data)

    const collection = db.collection(table_to_sync.mongo_collection)
    await collection.remove({})

    if (data && data.length) {
      await collection.insert(data)
    }
    await db.close()
  }
}


export async function lookForChanges() {
  for (const table_to_sync of config.sync) {
    const db = await mongo_client.connect( `mongodb://localhost:27017/${table_to_sync.mongo_database}`)
    let data = await readFile(`${build}/${table_to_sync.airtable_table}.json`)
    data = JSON.parse(data)

    const dont_sync = table_to_sync.dont_sync || []

    let changed = []

    const collection = db.collection(table_to_sync.mongo_collection)

    for (const airtable_record of data) {
      dont_sync.forEach((d) => {
        delete airtable_record[d]
      })

      let mongo_record = await collection.findOne({ __id: airtable_record.__id })
      if (!mongo_record) {
        console.log(`couldn't find ${airtable_record}`)
      } else {
        delete mongo_record._id
        dont_sync.forEach((d) => {
          delete mongo_record[d]
        })

        if (!deepEqual(airtable_record, mongo_record)) {
          let fields_changed = {}
          each(mongo_record.fields, (value, field_name) => {
            if (!deepEqual(airtable_record.fields[field_name], mongo_record.fields[field_name])) {
              fields_changed[field_name] = mongo_record.fields[field_name]
            }
          })

          changed.push({
            id: airtable_record.id,
            fields_changed
          })
        }
      }
    }
    await db.close()

    const filename = path.resolve(`${__dirname}/build/${table_to_sync.airtable_table}_changed.json`)
    return await writeFile(filename, changed, `utf-8`)
  }
}


export async function lookForNewItems() {
  for (const table_to_sync of config.sync) {
    const db =  await mongo_client.connect( `mongodb://localhost:27017/${table_to_sync.mongo_database}`)
    let new_items = []
    const dont_create_with = table_to_sync.dont_create_with || []

    const collection = await db.collection(table_to_sync.mongo_collection)
    let no_id_records = await collection.find({ __id: { $exists: false } }).toArray()

    no_id_records = no_id_records.map((record) => {
      delete record._id
      dont_create_with.forEach((d) => {
        delete record[d]
      })
      return record
    })

    new_items = no_id_records
    await db.close()

    const filename = path.resolve(`${__dirname}/build/${table_to_sync.airtable_table}_new.json`)
    return await writeFile(filename, new_items, `utf-8`)
  }
}
