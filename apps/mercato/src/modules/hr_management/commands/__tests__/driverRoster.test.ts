import { mapDriverStatusToEmployeeStatus, splitFullName } from '../driverRoster'

describe('driver roster mapping', () => {
  it('splits a full name at the first space', () => {
    expect(splitFullName('Ahmed Al-Harbi')).toEqual({ firstName: 'Ahmed', lastName: 'Al-Harbi' })
    expect(splitFullName('  Layla  bint  Omar  ')).toEqual({ firstName: 'Layla', lastName: 'bint  Omar' })
  })

  it('keeps a single-word name valid for the employee schema', () => {
    expect(splitFullName('Madonna')).toEqual({ firstName: 'Madonna', lastName: '-' })
  })

  it('maps operational availability onto the HR employment status', () => {
    expect(mapDriverStatusToEmployeeStatus('suspended')).toBe('suspended')
    expect(mapDriverStatusToEmployeeStatus('on_leave')).toBe('on_leave')
    expect(mapDriverStatusToEmployeeStatus('on_trip')).toBe('active')
    expect(mapDriverStatusToEmployeeStatus('available')).toBe('active')
    expect(mapDriverStatusToEmployeeStatus(undefined)).toBe('active')
  })
})
