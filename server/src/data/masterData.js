// BHEL Traction & DCS Master Data (Authoritative from PDF)

export const FACTORY_AREAS = ['KSM', 'PDR', 'CRM'];

export const ROLES = {
  KSM: 'KSM',
  PDR: 'PDR',
  CRM: 'CRM',
  AKR: 'AKR', // Master Admin
  CKG: 'CKG'  // Master Admin
};

export const KSM_MANPOWER = {
  assembly: [
    { name: 'KSM-OP-1', roles: ['Traction Mech Stage 1', 'DCS Doors/Side Covers', 'Traction PD Door'] },
    { name: 'KSM-OP-2', roles: ['Traction Mech Stage 1', 'DCS Doors/Side Covers'] }
  ],
  subAssembly: [
    { name: 'KSM-SUB-1', role: 'Sub-assembly preparation' },
    { name: 'KSM-SUB-2', role: 'Sub-assembly preparation' },
    { name: 'KSM-SUB-3', role: 'Sub-assembly preparation' }
  ]
};

export const PDR_MECHANICAL_MANPOWER = [
  { name: 'PDR-MECH-1', capacity: { traction: 10, dcs: 30, unit: 'per_month' } },
  { name: 'PDR-MECH-2', capacity: { traction: 10, dcs: 30, unit: 'per_month' } },
  { name: 'PDR-MECH-3', capacity: { traction: 10, dcs: 30, unit: 'per_month' } },
  { name: 'PDR-MECH-4', capacity: { traction: 10, dcs: 30, unit: 'per_month' } }
];

export const PDR_ELECTRICAL_TEAMS = [
  {
    id: 'PDR Team 1',
    name: 'PDR Team 1',
    members: 'PDR-ELEC-T1A, PDR-ELEC-T1B',
    capabilities: ['Traction HV', 'DCS'],
    capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true }
  },
  {
    id: 'PDR Team 2',
    name: 'PDR Team 2',
    members: 'PDR-ELEC-T2A, PDR-ELEC-T2B',
    capabilities: ['Traction HV', 'DCS'],
    capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true }
  },
  {
    id: 'PDR Team 3',
    name: 'PDR Team 3',
    members: 'PDR-ELEC-T3A, PDR-ELEC-T3B, PDR-ELEC-T3C',
    capabilities: ['Traction HV', 'Traction LV', 'DCS'],
    capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true }
  },
  {
    id: 'PDR Team 4',
    name: 'PDR Team 4',
    members: 'PDR-ELEC-T4A, PDR-ELEC-T4B',
    capabilities: ['Traction HV', 'Traction LV', 'DCS'],
    capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true }
  },
  {
    id: 'PDR Team 5',
    name: 'PDR Team 5',
    members: 'PDR-ELEC-T5A, PDR-ELEC-T5B, PDR-ELEC-T5C',
    capabilities: ['Traction HV', 'Traction LV', 'DCS'],
    capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true }
  },
  {
    id: 'PDR Team 6',
    name: 'PDR Team 6',
    members: 'PDR-ELEC-T6A, PDR-ELEC-T6B',
    capabilities: ['Traction LV', 'DCS'],
    capacity: { traction: 26, dcs: 5, unit: 'per_month', assumed: true, lvDailyRate: 1 }
  }
];

export const CRM_ELECTRICAL_TEAMS = [
  { id: 'CRM Team 1', name: 'CRM Team 1', members: 'CRM-OP-1A + CRM-OP-1B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } },
  { id: 'CRM Team 2', name: 'CRM Team 2', members: 'CRM-OP-2A + CRM-OP-2B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } },
  { id: 'CRM Team 3', name: 'CRM Team 3', members: 'CRM-OP-3A + CRM-OP-3B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } },
  { id: 'CRM Team 4', name: 'CRM Team 4', members: 'CRM-OP-4A + CRM-OP-4B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } },
  { id: 'CRM Team 5', name: 'CRM Team 5', members: 'CRM-OP-5A + CRM-OP-5B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } },
  { id: 'CRM Team 6', name: 'CRM Team 6', members: 'CRM-OP-6A + CRM-OP-6B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } },
  { id: 'CRM Team 7', name: 'CRM Team 7', members: 'CRM-OP-7A + CRM-OP-7B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } },
  { id: 'CRM Team 8', name: 'CRM Team 8', members: 'CRM-OP-8A + CRM-OP-8B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } },
  { id: 'CRM Team 9', name: 'CRM Team 9', members: 'CRM-OP-9A + CRM-OP-9B', capabilities: ['Traction HV', 'DCS'], capacity: { traction: 3, dcs: 5, unit: 'per_month', assumed: true } }
];

export const SUB_ASSEMBLY_ITEMS = [
  { item: 'Power Supply', dailyCapacity: 60, unit: 'units/day' },
  { item: '2-core Cable', dailyCapacity: 30, unit: 'sets/day' },
  { item: '3-core Cable', dailyCapacity: 30, unit: 'sets/day' },
  { item: '4-core Cable', dailyCapacity: 30, unit: 'sets/day' },
  { item: 'Panel Phase Busbar', dailyCapacity: 30, unit: 'sets/day' },
  { item: 'Relay Panels', dailyCapacity: 30, unit: 'sets/day' },
  { item: 'Panel Resistor', dailyCapacity: 30, unit: 'sets/day' },
  { item: 'DC-Link Capacitor', dailyCapacity: 30, unit: 'sets/day' }
];

export const TRACTION_WORKFLOW = [
  {
    stageNumber: 1,
    name: 'Mech Stage 1',
    area: 'KSM',
    eligibleWorkers: ['KSM-OP-1', 'KSM-OP-2'],
    notes: 'Door removal; KSM-OP-1 + KSM-OP-2'
  },
  {
    stageNumber: 2,
    name: 'Mech Stage 2',
    area: 'PDR',
    eligibleWorkers: ['PDR-MECH-1', 'PDR-MECH-2', 'PDR-MECH-3', 'PDR-MECH-4'],
    notes: 'Panel and core assemblies move to PDR'
  },
  {
    stageNumber: 3,
    name: 'HV Cabling',
    area: 'PDR', // Can be performed by PDR or CRM teams
    eligibleAreas: ['PDR', 'CRM'],
    eligibleWorkers: [
      'PDR Team 1', 'PDR Team 2', 'PDR Team 3', 'PDR Team 4', 'PDR Team 5',
      'CRM Team 1', 'CRM Team 2', 'CRM Team 3', 'CRM Team 4', 'CRM Team 5',
      'CRM Team 6', 'CRM Team 7', 'CRM Team 8', 'CRM Team 9'
    ],
    notes: 'By team availability (PDR & CRM eligible)'
  },
  {
    stageNumber: 4,
    name: 'Mech Stage 3',
    area: 'PDR',
    eligibleWorkers: ['PDR-MECH-1', 'PDR-MECH-2', 'PDR-MECH-3', 'PDR-MECH-4'],
    notes: 'Resonant cap loading, U busbar, NRV; any authorized mechanical worker'
  },
  {
    stageNumber: 5,
    name: 'LV Wiring',
    area: 'PDR',
    primaryWorker: 'PDR Team 6',
    eligibleWorkers: ['PDR Team 6', 'PDR Team 3', 'PDR Team 4', 'PDR Team 5'],
    notes: 'Mainly PDR Team 6; other teams when load is high'
  },
  {
    stageNumber: 6,
    name: 'Two-Test QC & Testing',
    area: 'KSM',
    eligibleWorkers: ['KSM QC', 'Testing Team (KSM Tracked)'],
    notes: 'Consolidated Quality control and Testing activity'
  },
  {
    stageNumber: 7,
    name: 'PD Activity',
    area: 'KSM',
    eligibleWorkers: ['KSM-OP-1', 'KSM-OP-2'],
    notes: 'Channel cover, dressing, door and side covers; KSM-OP-1 or KSM-OP-2 eligible'
  },
  {
    stageNumber: 8,
    name: 'PQ & Dispatch',
    area: 'KSM',
    eligibleWorkers: ['KSM QC', 'KSM Despatch'],
    notes: 'Pre-despatch Quality Check and Final Despatch'
  }
];

export const DCS_WORKFLOW = [
  {
    stageNumber: 1,
    name: 'Door / Side Cover',
    area: 'KSM',
    eligibleWorkers: ['KSM-OP-1', 'KSM-OP-2'],
    notes: 'KSM-OP-1 + KSM-OP-2, if applicable'
  },
  {
    stageNumber: 2,
    name: 'Mechanical',
    area: 'PDR',
    eligibleWorkers: ['PDR-MECH-1', 'PDR-MECH-2', 'PDR-MECH-3', 'PDR-MECH-4'],
    notes: 'Single mechanical stage'
  },
  {
    stageNumber: 3,
    name: 'Wiring',
    area: 'PDR',
    eligibleAreas: ['PDR', 'CRM'],
    eligibleWorkers: [
      'PDR Team 1', 'PDR Team 2', 'PDR Team 3', 'PDR Team 4', 'PDR Team 5', 'PDR Team 6',
      'CRM Team 1', 'CRM Team 2', 'CRM Team 3', 'CRM Team 4', 'CRM Team 5',
      'CRM Team 6', 'CRM Team 7', 'CRM Team 8', 'CRM Team 9'
    ],
    notes: 'By team availability (PDR & CRM eligible)'
  },
  {
    stageNumber: 4,
    name: 'Two-Test QC & Testing',
    area: 'KSM',
    eligibleWorkers: ['KSM QC', 'Testing Team (KSM Tracked)'],
    notes: 'Consolidated Quality check, offer to QC, and testing'
  },
  {
    stageNumber: 5,
    name: 'PD Activity',
    area: 'KSM',
    eligibleWorkers: ['KSM-OP-1', 'KSM-OP-2', 'KSM Team'],
    notes: 'Post-test channel cover & door preparation; KSM-OP-1 & KSM-OP-2 eligible'
  },
  {
    stageNumber: 6,
    name: 'PQ & Dispatch',
    area: 'KSM',
    eligibleWorkers: ['KSM QC', 'KSM Despatch'],
    notes: 'Pre-despatch Quality Check and Final Despatch'
  }
];

export const FACTORY_ASSUMPTIONS = [
  {
    id: 'A1',
    title: 'HV Team Capacity Period',
    assumption: 'Per Month (3 Traction OR 5 DCS)',
    pdfRef: 'Section 4 & Section 9: period assumed: per month — confirm both',
    status: 'Pending Confirmation'
  },
  {
    id: 'A2',
    title: 'Sub-Assembly Capacity Period',
    assumption: 'Per Day (60 power supplies, 30 others)',
    pdfRef: 'Section 4 & Section 9: assumed per day — confirm both',
    status: 'Pending Confirmation'
  },
  {
    id: 'A3',
    title: 'LV Wiring Working Days Conversion',
    assumption: '26 Working Days per month (1 LV panel/day = 26/month)',
    pdfRef: 'Section 9: LV capacity of 1 per day is converted to 26 working days per month',
    status: 'Configurable in portal (default 26)'
  },
  {
    id: 'A4',
    title: 'KSM Stage 1 Production Mode',
    assumption: '2 panels/day OR 1 Stage 1 + 2 door mountings/day',
    pdfRef: 'Section 4: Treated as daily targets, not monthly load %',
    status: 'Monitored via daily targets'
  },
  {
    id: 'A5',
    title: 'PDR Mechanical Capacity Allocation',
    assumption: '10 Traction / 30 DCS per month per individual worker',
    pdfRef: 'Section 4: Derived from load % formula example for an individual person',
    status: 'Per-person basis'
  },
  {
    id: 'A6',
    title: 'Rework and QC Rejection Workflow',
    assumption: 'Deferred to future iteration',
    pdfRef: 'Section 9: to be added if required',
    status: 'Flagged for future release'
  },
  {
    id: 'A7',
    title: 'Testing Team Identity',
    assumption: 'Separate external testing team; KSM tracks sending & receiving',
    pdfRef: 'Section 9: Testing performed by a separate team; KSM tracks it as a stage',
    status: 'KSM tracked stage'
  }
];
