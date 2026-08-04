import {
  commissionCents,
  normalizeAffiliateCode,
  planAllowed,
  validAffiliateCode,
  type AffiliateCodeRow,
} from '../affiliate'

const row: Pick<AffiliateCodeRow, 'eligible_plans'> = {
  eligible_plans: ['family', 'premium'],
}

describe('affiliate helpers', () => {
  it('normalizes affiliate codes for links and checkout', () => {
    expect(normalizeAffiliateCode(' eosPartner ')).toBe('EOSPARTNER')
    expect(normalizeAffiliateCode('bad code!*')).toBe('BADCODE')
    expect(validAffiliateCode('EOSPARTNER')).toBe(true)
    expect(validAffiliateCode('bad code')).toBe(false)
  })

  it('checks plan eligibility', () => {
    expect(planAllowed(row, 'family')).toBe(true)
    expect(planAllowed(row, 'premium')).toBe(true)
    expect(planAllowed({ eligible_plans: ['family'] }, 'premium')).toBe(false)
  })

  it('calculates commission only from positive paid amounts', () => {
    expect(commissionCents(990, 70)).toBe(693)
    expect(commissionCents(0, 70)).toBe(0)
    expect(commissionCents(990, 0)).toBe(0)
  })
})
