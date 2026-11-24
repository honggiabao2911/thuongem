import { app } from '../server/api.ts'
import { openStore } from '../server/store.ts'

const store = openStore(':memory:')
app(store, {
  origin: 'http://localhost:8788',
  publicKey: 'AQID',
  code: 'browser-testing-key-not-for-deploy',
  sender: async () => {},
}).listen(8788, '127.0.0.1')
