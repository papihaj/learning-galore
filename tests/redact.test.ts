import { describe, expect, test } from 'claude-code/testing'

import { isSecretPath, redact } from '../hooks/redact'

const fake = (...parts: string[]) => parts.join('')
const F = 'FAKEfake0123FAKEfake4567FAKEfake89'

describe('redact removes', () => {
  const cases: [string, string][] = [
    ['an Anthropic key', fake('sk-', 'ant-', 'api03-', F)],
    ['an OpenAI key', fake('sk-', 'proj-', F)],
    ['a GitHub token', fake('gh', 'p_', F)],
    ['a GitHub fine-grained token', fake('github', '_pat_', F)],
    ['an AWS key id', fake('AK', 'IA', 'FAKEFAKEFAKEFAKE')],
    ['a Slack token', fake('xo', 'xb-', '0000-FAKE-fake')],
    ['a JWT', fake('ey', 'JhbGciOiJIUzI1NiJ9', '.', 'ey', 'JzdWIiOiJmYWtlIn0', '.', 'FAKEsig_fake')],
    ['a random base64 string', 'q8ZrT2vLx9WmB4nKp7YcD3sHf6GjA1uE'],
    ['a long hex string', '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b'],
  ]
  for (const [name, secret] of cases) {
    test(name, () => {
      const out = redact(`here it is: ${secret} done`)
      expect(out).not.toContain(secret)
      expect(out).toContain('[redacted key]')
      expect(out).toContain('done')
    })
  }

  test('a private key block', () => {
    const pem = fake('-----BEGIN ', 'RSA PRIVATE KEY-----\nFAKEFAKE\nfake\n-----END ', 'RSA PRIVATE KEY-----')
    expect(redact(`key:\n${pem}\nafter`)).toBe('key:\n[redacted key]\nafter')
  })

  test('a private key block cut off before its end', () => {
    expect(redact(fake('-----BEGIN ', 'PRIVATE KEY-----\nFAKE'))).toBe('[redacted key]')
  })

  test('a bearer token', () => {
    expect(redact('Authorization: Bearer fake.token-value')).toBe('Authorization: Bearer [redacted key]')
  })

  test('.env lines', () => {
    const env = 'DATABASE_PASSWORD=hunter2\nexport STRIPE_API_KEY=fakefake\nPORT=3000'
    expect(redact(env)).toBe('DATABASE_PASSWORD=[redacted secret]\nexport STRIPE_API_KEY=[redacted secret]\nPORT=3000')
  })

  test('a quoted constant', () => {
    expect(redact('const AUTH_TOKEN = "fake-value"')).toBe('const AUTH_TOKEN = "[redacted secret]"')
  })
})

describe('redact keeps', () => {
  const kept = [
    'const apiKey = await getKey(config)',
    'API_KEY=$API_KEY npm start',
    'const API_URL = process.env.API_URL',
    'handleUserAuthenticationCallbackWithRetry',
    'src/components/settings/NotificationPreferencesPanel.tsx',
    'SOME_VERY_LONG_CONSTANT_NAME_FOR_TESTING_THINGS',
    'tool Bash: git commit -m "Fix the race in the search index"',
    'a uuid 123e4567-e89b-12d3-a456-426614174000',
    'Redact secrets before sending the digest to Haiku.',
    'Basic authentication sends a Bearer token on every request',
    'encodeUtf8StringAsBase64UrlSafeWithPadding',
  ]
  for (const line of kept) {
    test(line, () => {
      expect(redact(line)).toBe(line)
    })
  }
})

test('secrets files are recognized by name', () => {
  for (const p of ['.env', '/repo/.env.local', 'certs/server.pem', '/home/me/.ssh/id_rsa', '~/.aws/credentials']) {
    expect(isSecretPath(p)).toBe(true)
  }
  for (const p of ['src/env.ts', 'README.md', 'hooks/register.tsx', 'docs/environment.md']) {
    expect(isSecretPath(p)).toBe(false)
  }
})
