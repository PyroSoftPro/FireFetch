package com.example.firefetch.core.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadJobDao {
    @Query("SELECT * FROM download_jobs ORDER BY queuePosition ASC, addedAtEpochMs ASC")
    fun observeAll(): Flow<List<DownloadJobEntity>>

    @Query("SELECT * FROM download_jobs ORDER BY queuePosition ASC, addedAtEpochMs ASC")
    suspend fun listAllOnce(): List<DownloadJobEntity>

    @Query("SELECT * FROM download_jobs WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): DownloadJobEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(job: DownloadJobEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(jobs: List<DownloadJobEntity>)

    @Update
    suspend fun update(job: DownloadJobEntity)

    @Delete
    suspend fun delete(job: DownloadJobEntity)

    @Query("DELETE FROM download_jobs WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM download_jobs WHERE status IN (:statuses)")
    suspend fun deleteByStatuses(statuses: List<String>)

    @Query("SELECT * FROM download_jobs WHERE status = :status ORDER BY queuePosition ASC, addedAtEpochMs ASC")
    suspend fun listByStatus(status: String): List<DownloadJobEntity>

    @Transaction
    suspend fun reorderQueued(fromIndex: Int, toIndex: Int) {
        val queued = listByStatus("QUEUED").sortedBy { it.queuePosition }
        if (fromIndex !in queued.indices || toIndex !in queued.indices) return
        val mutable = queued.toMutableList()
        val item = mutable.removeAt(fromIndex)
        mutable.add(toIndex, item)

        // Rewrite positions to preserve stable order. Use sparse increments to allow cheap inserts.
        val base = System.currentTimeMillis()
        val updated = mutable.mapIndexed { idx, e ->
            e.copy(queuePosition = base + idx)
        }
        upsertAll(updated)
    }
}


