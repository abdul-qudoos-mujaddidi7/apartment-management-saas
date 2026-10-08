import { api } from './api';

export const listMeterReadings = (filters = {}) => {
  const query = new URLSearchParams({
    page: filters.page || 1,
    pageSize: filters.pageSize || 10,
    search: filters.search || '',
  });

  ['buildingId', 'floorId', 'apartmentId', 'meterId', 'utilityType', 'dateFrom', 'dateTo']
    .forEach((key) => {
      if (filters[key]) query.set(key, filters[key]);
    });

  if (filters.unbilled) query.set('unbilled', 'true');

  return api.get(`/meter-readings?${query.toString()}`);
};

export const getMeterReading = (id) => api.get(`/meter-readings/${id}`);
export const createMeterReading = (data) => api.post('/meter-readings', data);
export const updateMeterReading = (id, data) => api.patch(`/meter-readings/${id}`, data);
export const deleteMeterReading = (id) => api.delete(`/meter-readings/${id}`);
// Two rows suffice when editing: the newest prior row may be the row being
// moved. Filter it out so the preview follows the server's baseline sequence.
export async function readingBaseline(meter, readingDate, ignoreId = null) {
  const before = new Date(`${readingDate}T00:00:00Z`);
  if (Number.isNaN(before.getTime())) return null;
  before.setUTCDate(before.getUTCDate() - 1);
  const result = await listMeterReadings({ meterId: meter.id, dateTo: before.toISOString().slice(0, 10), pageSize: 2 });
  const prior = (result.items || []).find(r => r.id !== ignoreId);
  return { previousReading: prior?.resetBaseline ?? prior?.currentReading ?? meter.initialReading ?? 0, periodStart: prior?.readingDate.slice(0,10) || meter.installationDate?.slice(0,10) || '' };
}

export const getMeterReport = (filters = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== '' && value != null) query.set(key, value);
  return api.get('/meter-readings/report?' + query.toString());
};
