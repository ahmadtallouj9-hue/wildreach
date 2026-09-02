using System;
using System.Collections.Generic;

namespace VYTHERA.Core.Events
{
    public interface IEvent { }

    /// <summary>
    /// Type-safe zero-allocation generic event bus broker.
    /// </summary>
    public static class EventBus
    {
        private static class EventRegistry<T> where T : struct, IEvent
        {
            public static readonly List<Action<T>> Handlers = new List<Action<T>>(16);
        }

        public static void Subscribe<T>(Action<T> handler) where T : struct, IEvent
        {
            if (handler == null) return;
            var list = EventRegistry<T>.Handlers;
            if (!list.Contains(handler))
            {
                list.Add(handler);
            }
        }

        public static void Unsubscribe<T>(Action<T> handler) where T : struct, IEvent
        {
            if (handler == null) return;
            EventRegistry<T>.Handlers.Remove(handler);
        }

        public static void Publish<T>(T evt) where T : struct, IEvent
        {
            var handlers = EventRegistry<T>.Handlers;
            int count = handlers.Count;
            for (int i = 0; i < count; i++)
            {
                handlers[i].Invoke(evt);
            }
        }

        public static void ClearAll<T>() where T : struct, IEvent
        {
            EventRegistry<T>.Handlers.Clear();
        }
    }
}
