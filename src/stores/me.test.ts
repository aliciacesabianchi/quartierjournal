import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMe } from './me'
const mock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ db: () => ({ from: mock.from }) }))
function request() {
  const pending: Array<(value: unknown) => void> = []
  mock.from.mockImplementation(() => {
    const promise = new Promise(resolve => pending.push(resolve))
    const chain: any = { select: () => chain, order: () => chain, maybeSingle: () => chain, then: promise.then.bind(promise) }
    return chain
  })
  return (name: string, fail = false) => pending.forEach((resolve, i) => resolve({ data: i === 0 ? { user_id: name, locale: 'en' } : [], error: fail && i === 6 ? { message: 'Unavailable' } : null }))
}
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })
it('discards a response that completes after logout', async () => {
  const resolve = request(); const me = useMe(); const loading = me.load()
  me.reset(); resolve('old-user'); await loading
  expect(me.profile).toBeNull(); expect(me.loaded).toBe(false)
})
it('keeps the new account when the previous account responds late', async () => {
  const oldResponse = request(); const me = useMe(); const oldLoad = me.load()
  me.reset(); const newResponse = request(); const newLoad = me.load()
  newResponse('new-user'); await newLoad; oldResponse('old-user'); await oldLoad
  expect(me.profile?.user_id).toBe('new-user')
})
it('does not partially apply a failed set of queries', async () => {
  const resolve = request(); const me = useMe(); const loading = me.load()
  resolve('user', true); await expect(loading).rejects.toThrow('Unavailable')
  expect(me.profile).toBeNull(); expect(me.loaded).toBe(false)
})
