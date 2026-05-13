import { PatientList } from "./PatientList";

export default {
  list: PatientList,
  recordRepresentation: (record: {
    first_name?: string;
    last_name?: string;
  }) => `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim(),
};
