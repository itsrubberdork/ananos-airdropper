import { join } from 'path'
import { readFile } from 'fs/promises'
import { Server, Networks, Keypair } from 'stellar-sdk'
import TOML from '@ltd/j-toml'
import partition from 'lodash.partition'

import { accountValidator } from './lib/account_validator.js'
import { writeErrorReport } from './lib/write_error_report.js'

const pub = process.env.PUBLIC === 'true'
const BASEDIR = pub ? '.' : 'test'
const NETWORK = pub ? 'PUBLIC' : 'TESTNET'
const HORIZON_URL = `https://horizon${pub ? '' : '-testnet'}.stellar.org`

const setupFiles = Promise.all([
  'config.toml',
  'addresses.txt',
  'SECRETKEY'
].map(f => readFile(join(BASEDIR, f), 'utf8')))

setupFiles.catch((e) => {
  console.error(`File "${e.path}" not found. Exiting…`)
  process.exit(1)
})

const [config, addresses, secretkey] = await setupFiles

const { asset, airdrop } = TOML.parse(config)
asset.distributorKeypair = Keypair.fromSecret(secretkey.trim())

const server = new Server(HORIZON_URL)
const networkPassphrase = Networks[NETWORK]
const validateAccount = accountValidator(server, asset)
const accountIDs = addresses.split('\n').filter(s => !!s)
const validatedAccountIDs = await Promise.all(accountIDs.map(validateAccount))
const [validAccounts, invalidAccounts] = partition(validatedAccountIDs, acct => acct.success)

const VALIDATION_ERROR_REPORT = join(BASEDIR, 'reports', 'validation-errors.csv')
writeErrorReport(VALIDATION_ERROR_REPORT, invalidAccounts, ['address', 'fedAddress', 'reason'])
console.log(`Found problems with ${invalidAccounts.length} addresses. Errors logged in ${VALIDATION_ERROR_REPORT}`)
