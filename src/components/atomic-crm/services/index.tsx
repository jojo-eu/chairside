import { ServiceList } from "./ServiceList";

export default {
  list: ServiceList,
  recordRepresentation: (record: { name?: string }) => record.name ?? "",
};

export { ServiceList };
