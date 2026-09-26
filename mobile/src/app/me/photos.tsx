import { ErrorState, Screen, ScreenHeader, Skeleton } from "~/components";
import { PhotoManager } from "~/features/me/PhotoManager";
import { useMyProfile } from "~/hooks/queries";

export default function MyPhotos() {
  const me = useMyProfile();
  return (
    <Screen header={<ScreenHeader title="Photos" subtitle="Max 6 · review ke baad dikhti hain" />}>
      {me.isPending ? (
        <Skeleton height={300} radius={20} />
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : (
        <PhotoManager photos={me.data.photos} name={me.data.values.fullName ?? "Aap"} />
      )}
    </Screen>
  );
}
