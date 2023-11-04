import { useAtom, useAtomValue, useStore } from "jotai";
import { useClient } from "./useClient";
import { tldexStateAtom } from "@/store/tldex";
import { roomToLang, roomToVideoID, toParsedMessage } from "@/lib/socket";
import { roomsAtom, videoToRoomAtom } from "@/store/chat";
import { useEffect } from "react";

export function useChatDB(roomId: RoomIDString) {
  const client = useClient();
  const store = useStore();
  const tldexState = useAtomValue(tldexStateAtom);
  const [room, setRoom] = useAtom(roomsAtom(roomId));
  const [videoToRoom, setVideoToRoom] = useAtom(
    videoToRoomAtom(roomToVideoID(roomId)),
  );

  useEffect(() => {
    setVideoToRoom({
      type: "add",
      value: roomId,
    });

    () => {
      setVideoToRoom({
        type: "del",
        value: roomId,
      });
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Compares two ParsedMessage objects based on their timestamps.
   *
   * @param {ParsedMessage} a - The first ParsedMessage to compare.
   * @param {ParsedMessage} b - The second ParsedMessage to compare.
   * @return {number} Returns 1 if a is greater than b, -1 if a is less than b,
   * and 0 if a and b are equal.
   */
  function ParsedMessageComparator(a: ParsedMessage, b: ParsedMessage) {
    if (a.timestamp > b.timestamp) return 1;
    if (a.timestamp < b.timestamp) return -1;
    return 0;
  }

  /**
   * Compares two ParsedMessage objects based on their relative offsets.
   *
   * @param {ParsedMessage} a - The first ParsedMessage to compare.
   * @param {ParsedMessage} b - The second ParsedMessage to compare.
   * @return {number} Returns 1 if a is greater than b, -1 if a is less than b,
   * and 0 if a and b are equal.
   */
  function ParsedMessageOFFSETComparator(a: ParsedMessage, b: ParsedMessage) {
    if (a.video_offset > b.video_offset) return 1;
    if (a.video_offset < b.video_offset) return -1;
    return 0;
  }

  function sortRoom() {
    console.log("sorting...", room);

    (room.messages as ParsedMessage[]).sort(ParsedMessageComparator);
  }

  /**
   * Optimized method for adding message to a chatroom.
   * @param message the message content.
   */
  function addMessage(message: ParsedMessage) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      messages: [...currentRoom.messages, message].sort(
        ParsedMessageComparator,
      ),
    }));
    // if (!ChatDB.checkArrayIsUnique(this.room as ParsedMessage[])) {
    //   this.rooms.set(
    //     room,
    //     ChatDB.distinctSortedArray(this.room as ParsedMessage[])
    //   );
    // }
  }

  /**
   * Optimized method for adding many messages to a chatroom.
   * @param messages the messages to add.
   */
  function addMessages(messages: ParsedMessage[]) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      messages: [...currentRoom.messages, ...messages].sort(
        ParsedMessageComparator,
      ),
    }));
    // if (!ChatDB.checkArrayIsUnique(this.room as ParsedMessage[])) {
    //   this.rooms.set(
    //     room,
    //     ChatDB.distinctSortedArray(this.room as ParsedMessage[])
    //   );
    // }
  }

  /**
   * Updates the current offset of a video,
   * @param elapsed elapsed time in seconds
   * @param absolute the elapsed time + available_at time
   */
  function updateRoomElapsed(elapsed: number, absolute: number | undefined) {
    videoToRoom.forEach((roomId) => {
      store.set(roomsAtom(roomId), (currentRoom) => ({
        ...currentRoom,
        elapsed,
        absolute,
      }));
    });
  }

  /**
   *
   * @param partial how many to load if partially loading.
   */
  function loadMessages(partial?: number) {
    console.log("[Load message] room:", room, "partial:", partial);
    if (room.state.loading) return;
    const prior = room?.messages?.[0]?.timestamp;

    const videoId = roomToVideoID(roomId);

    const params = {
      lang: roomToLang(roomId),
      verified: tldexState.liveTlShowVerified,
      moderator: tldexState.liveTlShowModerator,
      vtuber: tldexState.liveTlShowVtuber,
      limit: partial,
      ...(prior && { before: prior }),
    };

    setRoom((currentRoom) => ({
      ...currentRoom,
      state: { loading: true, completed: false },
    }));

    client
      .get<TLDexMessage[]>(`/api/v2/videos/${videoId}/chats`, { params })
      .then((data) => {
        addMessages(data.map((x) => toParsedMessage(x, videoId)));
        setRoom((currentRoom) => ({
          ...currentRoom,
          state: {
            completed: data.length !== partial,
            loading: false,
          },
        }));
      })
      .catch((e) => {
        console.error(e);
        setRoom((currentRoom) => ({
          ...currentRoom,
          state: {
            completed: false,
            loading: false,
          },
        }));
      });
  }

  return {
    ParsedMessageComparator,
    ParsedMessageOFFSETComparator,
    sortRoom,
    addMessage,
    addMessages,
    updateRoomElapsed,
    loadMessages,
  };
}
