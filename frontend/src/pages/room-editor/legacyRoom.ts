import type { VenueDetail } from "../../api/types";
import { createRoom } from "./roomModel";
import type { RoomLayout } from "./roomModel";

/** Read old restaurant layouts without writing or changing their ids. */
export function legacyRoom(info: VenueDetail): RoomLayout {
  const room = createRoom("Main room", info.width, info.height);
  room.key = "implicit-main";
  room.zones = info.zones.map(zone => ({ ...zone }));
  room.tables = info.tables.map(table => ({
    id: table.id, key: table.key, zone_key: table.zone_id === null ? null : String(table.zone_id),
    label: table.label, shape: table.shape, x: table.x, y: table.y, w: table.w, h: table.h,
    rotation: table.rotation, min_party: table.min_party, max_party: table.max_party,
    is_accessible: table.is_accessible, high_chair_ok: table.high_chair_ok,
    combine_group: table.combine_group, is_active: true,
    seats: info.seats.filter(seat => seat.table_id === table.id).map(seat => ({
      id: seat.id, key: seat.key, label: seat.label, x: seat.x, y: seat.y,
      is_accessible: seat.is_accessible, is_blocked: seat.is_blocked,
    })),
  }));
  return { base_version: 0, rooms: [room] };
}
