import { describe, expect, it } from 'vitest'
import { classify as appClassify, RULES as appRules } from './taxonomy'
import { classify as fnClassify, RULES as fnRules, LABEL_MAIN_DE, LABEL_SUB_DE } from '../../supabase/functions/_shared/taxonomy'

describe('overview function taxonomy copy', () => {
  it('has the same rules as the app and classifies identically', () => {
    expect(fnRules.map((r) => r.sub + r.re.source)).toEqual(appRules.map((r) => r.sub + r.re.source))
    for (const title of ['Eltern-Kind-Singen', 'Adventskonzert', 'Kinderflohmarkt', 'Yoga', 'Ludothek Zürich 7', 'Bücherkiste – PBZ Hardau', 'Irgendetwas']) {
      expect(fnClassify({ title, category: null })).toEqual(appClassify({ title, category: null }))
    }
  })
  it('has a German label for every main and sub category', () => {
    for (const r of fnRules) { expect(LABEL_SUB_DE[r.sub], r.sub).toBeTruthy(); expect(LABEL_MAIN_DE[r.main], r.main).toBeTruthy() }
  })
})
