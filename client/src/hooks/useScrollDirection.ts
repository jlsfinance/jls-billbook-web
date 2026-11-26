import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';

type ScrollDirection = 'up' | 'down';

export function useScrollDirection(
    targetRef: RefObject<HTMLElement | null>,
    viewKey: string,
    enabled: boolean,
    onDirection: (direction: ScrollDirection) => void,
) {
    const notify = useEffectEvent(onDirection);

    useEffect(() => {
        const target = targetRef.current;
        if (!target || !enabled) return;

        let lastPosition = Math.max(0, target.scrollTop);
        let previousDirection: ScrollDirection | undefined;
        let frame = 0;

        const onScroll = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                const position = Math.max(0, target.scrollTop);
                const difference = position - lastPosition;
                if (Math.abs(difference) < 10) return;
                lastPosition = position;
                const direction = difference > 0 ? 'down' : 'up';
                if (direction === previousDirection) return;
                previousDirection = direction;
                notify(direction);
            });
        };

        target.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            target.removeEventListener('scroll', onScroll);
            window.cancelAnimationFrame(frame);
        };
    }, [targetRef, viewKey, enabled]);
}
